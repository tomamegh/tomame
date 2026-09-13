/**
 * The account's own record: name, bio, phone, and how the customer wants to be
 * reached.
 *
 * Business logic only (CLAUDE.md) — no request or response objects reach this
 * file. It owns two rules the database cannot express and the browser must not
 * be trusted with, plus the audit entry for every change.
 */

import { logAuditEvent } from "@/features/audit/services/audit.service";
import {
  selectAccountProfile,
  updateAccountProfile as writeAccountProfile,
  type AccountProfilePatch,
  type AccountProfileRow,
} from "@/db/queries/profiles";
import { APIError } from "@/lib/auth/api-helpers";
import { createClient } from "@/lib/supabase/server";
import type { PlatformRoles } from "@/features/auth/types";
import type { UpdateAccountProfileInput } from "../schema";

/** The account as the screen shows it — the profile row plus the auth identity. */
export interface AccountProfile extends AccountProfileRow {
  /**
   * From `auth.users`, not `profiles` — there is no email column on the profile
   * row. Read-only on this screen: changing a sign-in address is an auth flow
   * with its own confirmation mail, and pretending otherwise with an editable
   * field would be a lie about what the Save button does.
   */
  email: string | null;
}

/**
 * Which channels will actually carry a message to this customer.
 *
 * Derived, never stored: `whatsapp_opt_in` can be true while `phone` is null
 * (the customer opted in, then cleared the number), and a screen that reported
 * "WhatsApp: on" in that state would be describing a message nobody can send.
 */
export interface NotificationChannelState {
  email: boolean;
  whatsapp: boolean;
  /** True when the customer wants WhatsApp but we hold no number to send to. */
  whatsappNeedsPhone: boolean;
}

export function resolveNotificationChannels(
  profile: Pick<AccountProfileRow, "phone" | "notify_email" | "whatsapp_opt_in">,
): NotificationChannelState {
  const hasPhone = typeof profile.phone === "string" && profile.phone.trim() !== "";
  return {
    email: profile.notify_email,
    whatsapp: profile.whatsapp_opt_in && hasPhone,
    whatsappNeedsPhone: profile.whatsapp_opt_in && !hasPhone,
  };
}

/**
 * Reads the viewer's own profile through their client, so RLS is the thing that
 * decides whose row comes back rather than a `userId` argument we trust.
 */
export async function getAccountProfile(
  userId: string,
  email: string | null,
): Promise<AccountProfile> {
  const client = await createClient();
  const row = await selectAccountProfile(client, userId);
  if (!row) {
    // A signed-in user always has a profile — 001's trigger creates one on
    // insert into auth.users. Reaching here means the row was deleted out from
    // under a live session, which is a 404 for this account, not an empty form.
    throw new APIError(404, "Profile not found");
  }
  return { ...row, email };
}

/**
 * Applies a validated patch.
 *
 * Two rules live here rather than in the schema, because both need the row as
 * it currently stands and a schema only sees the request:
 *
 * 1. **WhatsApp needs a number.** Opting in with no phone — neither in this
 *    patch nor already on the row — is rejected instead of being silently
 *    stored, so the toggle cannot end up on while nothing can be delivered.
 * 2. **Clearing the phone clears the opt-in.** The customer is withdrawing the
 *    number the consent was attached to; leaving `whatsapp_opt_in` true would
 *    leave a dangling consent for a channel with no address, and would switch
 *    itself back on the moment they saved a new number.
 */
export async function updateAccountProfile(
  actor: { id: string; role: PlatformRoles; email: string | null },
  input: UpdateAccountProfileInput,
): Promise<AccountProfile> {
  const client = await createClient();
  const current = await selectAccountProfile(client, actor.id);
  if (!current) {
    throw new APIError(404, "Profile not found");
  }

  const patch: AccountProfilePatch = { ...input };

  // `undefined` means "not in this patch"; `null` means "clear it".
  const phoneAfter = input.phone === undefined ? current.phone : input.phone;
  const hasPhoneAfter = typeof phoneAfter === "string" && phoneAfter.trim() !== "";

  const wantsWhatsapp =
    input.whatsapp_opt_in === undefined ? current.whatsapp_opt_in : input.whatsapp_opt_in;

  if (input.whatsapp_opt_in === true && !hasPhoneAfter) {
    throw new APIError(400, "Add a phone number before turning on WhatsApp updates");
  }
  if (wantsWhatsapp && !hasPhoneAfter) {
    patch.whatsapp_opt_in = false;
  }

  const row = await writeAccountProfile(client, actor.id, patch);

  // CLAUDE.md audits mutations to payment state, order state, roles and job
  // state; a profile edit is none of those. The entry is kept anyway because
  // this endpoint already wrote one before Phase 6, and `/admin/account`'s
  // activity card reads `audit_logs` through `GET /api/app/me/activity` —
  // dropping it would quietly blank that list. The changed FIELD NAMES are
  // recorded, never the values: `audit_logs` is append-only, so a phone number
  // written there could never be removed again.
  await logAuditEvent({
    actorId: actor.id,
    actorRole: actor.role,
    action: "user_profile_updated",
    entityType: "user",
    entityId: actor.id,
    metadata: { fields: Object.keys(patch).sort() },
  });

  return { ...row, email: actor.email };
}
