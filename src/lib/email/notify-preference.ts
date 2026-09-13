import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * May we email this customer?
 *
 * `profiles.notify_email` (051) is the account screen's "Email" toggle, whose
 * description promises it governs "order confirmations, payment receipts and
 * delivery updates". It was written by that screen and read by nothing: every
 * send path — order status, payment receipts, price drops — mailed regardless,
 * so a customer who turned it off kept receiving everything. A preference the UI
 * presents as effective and which does nothing is worse than not offering one.
 *
 * The check is by user id rather than address because the address alone cannot
 * be traced back to a preference, and because the row is the authority.
 *
 * FAILS OPEN, deliberately. If the lookup errors we send. These are
 * transactional messages about money and parcels — a receipt the customer never
 * gets is a worse outcome than one they did not strictly want — and a database
 * blip must not silently swallow them. Only an explicit `false` suppresses.
 *
 * NOT a marketing opt-out. Nothing here sends marketing; if that ever changes it
 * needs its own consent flag, because transactional and marketing consent are
 * not the same permission.
 */
export async function mayEmailUser(userId: string | null): Promise<boolean> {
  // No account (a signed-out visitor's contact reply, say) means no preference
  // to honour — the caller decided to write to them.
  if (!userId) return true;

  try {
    const { data, error } = await createAdminClient()
      .from("profiles")
      .select("notify_email")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      logger.warn("email preference lookup failed; sending", { userId, message: error.message });
      return true;
    }
    return (data as { notify_email?: boolean } | null)?.notify_email !== false;
  } catch (err) {
    logger.warn("email preference lookup threw; sending", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return true;
  }
}
