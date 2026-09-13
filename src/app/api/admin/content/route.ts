import type { NextRequest } from "next/server";
import { z } from "zod";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAdmin, requireAuth } from "@/lib/auth/guards";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import {
  getDeliveryZone,
  getRegion,
  getSiteSetting,
  updateDeliveryZone,
  updateRegion,
  updateSiteContentRow,
  updateSiteSettingValue,
} from "@/db/queries/admin-content";

/**
 * Writes for the admin-owned content layer — `site_settings`, `site_content`,
 * `regions` and `delivery_zones`.
 *
 * ONE ROUTE, FOUR TARGETS, discriminated on `target`. Four routes would be four
 * copies of the same rate limit, the same `requireAdmin` and the same audit
 * call, and the thing this session found on `/api/admin/dashboard` — a handler
 * that shipped with neither check — is exactly what copy-and-paste auth
 * produces. One entry point is one place to get the guard right.
 *
 * TWO OF THESE ARE NOT COSMETIC and are validated accordingly:
 *
 * `site_settings.payment_channels` is read by the bag's pay selector, which
 * passes each entry's `paystack_channel` to Paystack. 037 seeded it as plain
 * label strings and 048 replaced it with objects; the footer's reader accepts
 * both shapes, so a well-meaning flattening back to labels would look right on
 * the marketing site and quietly take every channel off checkout. The schema
 * below therefore refuses anything that is not the 048 shape.
 *
 * `delivery_zones.fee_ghs` is money charged once per checkout on the bag's
 * chosen zone. Every change to it is audited with both the old and the new
 * figure, and the UI confirms it — CLAUDE.md requires the audit and the fee is
 * a customer-facing price.
 *
 * Layering: this file authenticates, validates and audits. The reads and writes
 * are `db/queries/admin-content`, and no business rule lives here beyond the
 * shape contracts above.
 */

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * One entry of `payment_channels`, as 048 stores it.
 *
 * `paystack_channel` is the only field with a closed set, because it is the
 * value handed to Paystack; `provider` and `dot` are presentation and are
 * allowed to be null. Unknown extra keys are stripped rather than rejected so a
 * future field added by a migration does not make this route reject rows it
 * wrote itself.
 */
const paymentChannelSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  paystack_channel: z.enum(["mobile_money", "card"]),
  provider: z.string().nullable().optional(),
  dot: z.string().nullable().optional(),
});

const settingPatchSchema = z.object({
  target: z.literal("setting"),
  key: z.string().min(1).max(128),
  /** JSONB — any shape. Per-key contracts are enforced below. */
  value: z.unknown(),
});

const contentPatchSchema = z.object({
  target: z.literal("block"),
  id: z.uuid(),
  title: z.string().max(512).nullable().optional(),
  body: z.string().max(20_000).nullable().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
  is_published: z.boolean().optional(),
});

const regionPatchSchema = z.object({
  target: z.literal("region"),
  code: z.string().min(1).max(32),
  status: z.enum(["live", "soon", "off"]).optional(),
  hub_city: z.string().max(128).nullable().optional(),
  transit_days_min: z.number().int().min(0).max(365).nullable().optional(),
  transit_days_max: z.number().int().min(0).max(365).nullable().optional(),
  blurb: z.string().max(2000).nullable().optional(),
});

const zonePatchSchema = z.object({
  target: z.literal("zone"),
  id: z.uuid(),
  /** GHS. Non-negative and capped — a stray keystroke must not price a delivery at five figures. */
  fee_ghs: z.number().min(0).max(100_000).optional(),
  extra_days: z.number().int().min(0).max(90).optional(),
  note: z.string().max(500).nullable().optional(),
  is_active: z.boolean().optional(),
});

const patchSchema = z.discriminatedUnion("target", [
  settingPatchSchema,
  contentPatchSchema,
  regionPatchSchema,
  zonePatchSchema,
]);

export async function PATCH(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-content:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    const admin = requireAdmin(auth);

    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    switch (parsed.data.target) {
      case "setting":
        return successResponse(await patchSetting(parsed.data, admin.id, admin.email ?? null));
      case "block":
        return successResponse(await patchBlock(parsed.data, admin.id, admin.email ?? null));
      case "region":
        return successResponse(await patchRegion(parsed.data, admin.id, admin.email ?? null));
      case "zone":
        return successResponse(await patchZone(parsed.data, admin.id, admin.email ?? null));
    }
  } catch (error) {
    return errorResponse(error);
  }
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function patchSetting(
  input: z.infer<typeof settingPatchSchema>,
  actorId: string,
  actorEmail: string | null,
) {
  const current = await getSiteSetting(input.key);
  if (!current) throw new APIError(404, `No site setting called “${input.key}”`);

  const value = validateSettingValue(input.key, input.value);

  const updated = await updateSiteSettingValue(input.key, value, actorId);
  if (!updated) throw new APIError(500, "The setting did not save");

  await logAuditEvent({
    actorId,
    actorRole: "admin",
    action: "site_setting_updated",
    // `entity_id` is a UUID column and a setting key is not one. Passing a key
    // makes the insert fail with 22P02, and `logAuditEvent` swallows failures
    // by design — so the edit would succeed with nothing recorded. The key
    // travels in metadata, queryable as metadata->>'key' (the media builder
    // route solves the same problem the same way).
    entityType: "store",
    entityId: null,
    metadata: {
      table: "site_settings",
      key: input.key,
      previousValue: current.value,
      newValue: value,
      actorEmail,
    },
  });

  return updated;
}

/**
 * Per-key shape contracts.
 *
 * Only the keys something downstream parses get one. Everything else is stored
 * as given — `site_settings` is a JSONB bag by design and an admin adding a new
 * key through a migration should not have to teach this route about it.
 */
function validateSettingValue(key: string, value: unknown): unknown {
  if (key === "payment_channels") {
    const parsed = z.array(paymentChannelSchema).min(1).safeParse(value);
    if (!parsed.success) {
      throw new APIError(
        400,
        "Each payment channel needs an id, a label and a paystack_channel of “mobile_money” or “card”. The bag sends that value to Paystack, so a channel without one disappears from checkout.",
      );
    }
    return parsed.data;
  }
  return value;
}

async function patchBlock(
  input: z.infer<typeof contentPatchSchema>,
  actorId: string,
  actorEmail: string | null,
) {
  const { target: _target, id, ...patch } = input;
  if (Object.keys(patch).length === 0) throw new APIError(400, "Nothing to change");

  const updated = await updateSiteContentRow(id, patch, actorId);
  if (!updated) throw new APIError(404, "That content block no longer exists");

  await logAuditEvent({
    actorId,
    actorRole: "admin",
    action: "site_content_updated",
    entityType: "store",
    entityId: id,
    metadata: {
      table: "site_content",
      kind: updated.kind,
      slug: updated.slug,
      changed: Object.keys(patch),
      is_published: updated.is_published,
      actorEmail,
    },
  });

  return updated;
}

async function patchRegion(
  input: z.infer<typeof regionPatchSchema>,
  actorId: string,
  actorEmail: string | null,
) {
  const { target: _target, code, ...patch } = input;
  if (Object.keys(patch).length === 0) throw new APIError(400, "Nothing to change");

  const current = await getRegion(code);
  if (!current) throw new APIError(404, `No region with code “${code}”`);

  const updated = await updateRegion(code, patch, actorId);
  if (!updated) throw new APIError(500, "The region did not save");

  await logAuditEvent({
    actorId,
    actorRole: "admin",
    action: "region_updated",
    // `regions.code` is TEXT, not a UUID — same reason as the setting above.
    entityType: "store",
    entityId: null,
    metadata: {
      table: "regions",
      code,
      previousStatus: current.status,
      newStatus: updated.status,
      changed: Object.keys(patch),
      actorEmail,
    },
  });

  return updated;
}

async function patchZone(
  input: z.infer<typeof zonePatchSchema>,
  actorId: string,
  actorEmail: string | null,
) {
  const { target: _target, id, ...patch } = input;
  if (Object.keys(patch).length === 0) throw new APIError(400, "Nothing to change");

  const current = await getDeliveryZone(id);
  if (!current) throw new APIError(404, "That delivery zone no longer exists");

  const updated = await updateDeliveryZone(id, patch, actorId);
  if (!updated) throw new APIError(500, "The delivery zone did not save");

  // A fee change is a change to what a customer pays at checkout, so it is
  // audited as one — with both figures, so the log answers "what was it
  // before" without a second query.
  const feeChanged = patch.fee_ghs != null && patch.fee_ghs !== current.fee_ghs;

  await logAuditEvent({
    actorId,
    actorRole: "admin",
    action: feeChanged ? "delivery_zone_fee_updated" : "delivery_zone_updated",
    entityType: "store",
    entityId: id,
    metadata: {
      table: "delivery_zones",
      name: current.name,
      previousFeeGhs: current.fee_ghs,
      newFeeGhs: updated.fee_ghs,
      previousActive: current.is_active,
      newActive: updated.is_active,
      changed: Object.keys(patch),
      actorEmail,
    },
  });

  return updated;
}
