import "server-only";

import { AUDIT_ACTOR_ROLES, AUDIT_ENTITY_TYPES } from "@/config/constants";
import { deleteBanner, getBannerById, insertBanner, listLiveBanners, updateBanner } from "@/db/queries/site-banners";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { APIError } from "@/lib/auth/api-helpers";
import { logger } from "@/lib/logger";
import type { CreateBannerInput, UpdateBannerInput } from "../schema";
import type { BannerPlacement, LiveBanner, SiteBanner } from "../types";

/**
 * Banners (089): the live read for customer pages, and the admin's audited
 * writes. A banner is public text Tomame stands behind — "we do not take
 * international payments" — so who switched it on or off is recorded.
 */

export interface BannerActor {
  id: string;
  email: string | null;
}

/**
 * The live banners for one slot. Never throws: a banner is an extra on a page
 * that works without it, and a failed read must not take checkout down.
 */
export async function getLiveBanners(placement: BannerPlacement): Promise<LiveBanner[]> {
  try {
    return await listLiveBanners(placement);
  } catch (error) {
    logger.warn("banners: live read failed; rendering none", {
      placement,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export async function createBanner(actor: BannerActor, input: CreateBannerInput): Promise<SiteBanner> {
  const row = await insertBanner(input, actor.id);
  await audit(actor, "banner_created", row, { placement: row.placement, title: row.title, is_active: row.is_active });
  return row;
}

export async function editBanner(actor: BannerActor, id: string, patch: UpdateBannerInput): Promise<SiteBanner> {
  const current = await getBannerById(id);
  if (!current) throw new APIError(404, "That banner no longer exists");

  // The table's pair constraints span fields a PATCH may send only half of;
  // check them against the merged row so the admin hears why, not a 500.
  const next = { ...current, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
  if ((next.link_label == null) !== (next.link_url == null)) throw new APIError(400, "A link needs both its text and where it goes");
  if (next.starts_at && next.ends_at && new Date(next.ends_at) <= new Date(next.starts_at)) {
    throw new APIError(400, "The end must come after the start");
  }

  const row = await updateBanner(id, patch, actor.id);
  if (!row) throw new APIError(404, "That banner no longer exists");
  await audit(actor, "banner_updated", row, {
    fields: Object.keys(patch).filter((k) => patch[k as keyof UpdateBannerInput] !== undefined),
    // Switching a banner on or off is the change an investigation looks for.
    ...(patch.is_active !== undefined && { is_active: { from: current.is_active, to: row.is_active } }),
  });
  return row;
}

export async function removeBanner(actor: BannerActor, id: string): Promise<void> {
  const current = await getBannerById(id);
  if (!current || !(await deleteBanner(id))) throw new APIError(404, "That banner no longer exists");
  await audit(actor, "banner_deleted", current, { placement: current.placement, title: current.title, was_active: current.is_active });
}

async function audit(actor: BannerActor, action: string, banner: SiteBanner, metadata: Record<string, unknown>) {
  await logAuditEvent({
    actorId: actor.id,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    action,
    entityType: AUDIT_ENTITY_TYPES.SITE_BANNER,
    entityId: banner.id,
    metadata: { table: "site_banners", actorEmail: actor.email, ...metadata },
  });
}
