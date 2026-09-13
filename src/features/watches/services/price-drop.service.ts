import "server-only";

import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { PRICE_DROP_NOTIFY_PCT_KEY } from "@/config/pricing";
import { getPricingConstantsMap } from "@/db/queries/pricing-constants";
import {
  getRecipientEmail,
  insertNotification,
  markNotificationDelivered,
} from "@/db/queries/notifications";
import { markWatchNotified, type PriceWatchRow } from "@/db/queries/price-watches";
import { sendEmail } from "@/lib/email/transport";
import { mayEmailUser } from "@/lib/email/notify-preference";
import { priceDropTemplate } from "@/lib/email/templates/price-drop";
import { isSchemaMissingError } from "@/lib/supabase/errors";
import type { PriceDropDecision, PriceDropOutcome, PriceDropReading } from "../types";

/**
 * Price-drop alerts for price watches (migration 052).
 *
 * THE PROBLEM THIS FILE EXISTS TO SOLVE is not "notice a drop" — the job has
 * been noticing drops since 041 and appending the observation that proves it.
 * It is "notice a drop WITHOUT emailing the same customer every run for a week".
 *
 * The naive rule — email whenever the price is below where it started — spams,
 * because a price that falls on Monday and stays there is still below the
 * baseline on Tuesday, Wednesday and Thursday. Nor does "email whenever the
 * price is below yesterday's" work: a store that oscillates a dollar either way
 * generates an alert every other day, and each one is noise.
 *
 * So the reference point MOVES WITH THE CUSTOMER'S KNOWLEDGE. `decidePriceDrop`
 * measures every reading against `notified_price_usd` — the price the last
 * alert actually quoted — falling back to the baseline only while no alert has
 * ever been sent. A second alert therefore requires the price to fall by the
 * threshold again, starting from the number already in the customer's inbox.
 * A price that dips, recovers and returns to the same level clears no new
 * ground and sends nothing, which is exactly the case the tests pin down.
 *
 * CURRENCY. The decision is made on `price_usd` alone. GH₵ carries the exchange
 * rate as well as the store price, so a GH₵ fall can be nothing but the cedi
 * strengthening — alerting on it would promise a discount that is not there.
 */

// ── The rule (pure) ─────────────────────────────────────────────────────────

/**
 * Should this reading produce an alert, and against what?
 *
 * Pure and synchronous on purpose: this is the one piece of logic that must be
 * exhaustively testable without a database, a mailbox or a clock.
 */
export function decidePriceDrop(
  watch: Pick<PriceWatchRow, "notify_on_drop" | "baseline_price_usd" | "notified_price_usd">,
  observedPriceUsd: number,
  thresholdPct: number,
): PriceDropDecision {
  // The customer's own switch wins over everything below it.
  if (!watch.notify_on_drop) {
    return { notify: false, reason: "muted", reference_price_usd: null, drop_pct: null };
  }

  if (!Number.isFinite(observedPriceUsd) || observedPriceUsd <= 0) {
    return { notify: false, reason: "no_reading", reference_price_usd: null, drop_pct: null };
  }

  // `notified_price_usd` first: what the customer was last TOLD, not where the
  // watch started. This single line is the re-notification rule.
  const reference = firstPositive(watch.notified_price_usd, watch.baseline_price_usd);

  // A watch with no baseline and no alert behind it has nothing to compare
  // against — the first observation is the reference, not a drop.
  if (reference === null) {
    return { notify: false, reason: "no_reference", reference_price_usd: null, drop_pct: null };
  }

  const dropPct = (reference - observedPriceUsd) / reference;

  // Ties go to silence: `>=` on a threshold of exactly 0 would mean "email on
  // every reading that is not an increase", which is why `resolveDropThreshold`
  // refuses a threshold of 0 in the first place.
  if (dropPct < thresholdPct) {
    return {
      notify: false,
      reason: dropPct > 0 ? "below_threshold" : "no_drop",
      reference_price_usd: reference,
      drop_pct: dropPct,
    };
  }

  return { notify: true, reason: "drop", reference_price_usd: reference, drop_pct: dropPct };
}

/**
 * The admin-tuned threshold, read once per job run.
 *
 * Nothing static: the number lives in `pricing_constants` (052) so an admin can
 * move it without a deploy. An absent or nonsensical row disables alerts rather
 * than substituting a literal — a threshold of 0 would email on every flat
 * reading and a threshold of 1 would demand a free product, and inventing a
 * value in code is precisely how a "temporary default" becomes the real
 * configuration nobody can find.
 *
 * A MISSING TABLE still throws. That is a deploy-ordering bug, not a
 * configuration gap (phase-2 handoff, gotcha 8).
 */
export async function resolveDropThreshold(): Promise<number | null> {
  const constants = await getPricingConstantsMap();
  const value = constants[PRICE_DROP_NOTIFY_PCT_KEY];

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value >= 1) {
    logger.warn("price-drop: no usable threshold; alerts are off", {
      key: PRICE_DROP_NOTIFY_PCT_KEY,
      value: value ?? null,
    });
    return null;
  }

  return value;
}

// ── Sending ─────────────────────────────────────────────────────────────────

/**
 * Evaluate one re-check and, if it is a genuine drop, write to the customer.
 *
 * ORDER OF WRITES matters here. The `notifications` row is inserted as
 * `pending` BEFORE the transport is attempted, so a failed send leaves a
 * durable, admin-visible record instead of vanishing. The watch's notification
 * reference is then moved regardless of whether Resend accepted the message,
 * because the decision to tell this customer about this price has been made and
 * recorded — re-deciding it on the next run would retry a dead address every
 * ten minutes forever, and re-delivery is the notification layer's job
 * (`pending → sent | failed` in CLAUDE.md's state machine), not a reason to
 * re-run the drop rule.
 *
 * Never throws for a delivery problem: an alert that cannot be sent must not
 * fail the price check that found it. A missing table still propagates.
 */
export async function notifyPriceDrop(
  watch: PriceWatchRow,
  reading: PriceDropReading,
  thresholdPct: number | null,
  now: Date = new Date(),
): Promise<PriceDropOutcome> {
  if (thresholdPct === null) return { notified: false, reason: "no_threshold" };

  const decision = decidePriceDrop(watch, reading.priceUsd, thresholdPct);
  if (!decision.notify || decision.reference_price_usd === null || decision.drop_pct === null) {
    return { notified: false, reason: decision.reason };
  }

  // The account-wide "Email" toggle. `notify_on_drop` is this watch's own switch;
  // this is the customer saying "no email at all", and it outranks it.
  if (!(await mayEmailUser(watch.user_id))) return { notified: false, reason: "email_off" };

  const email = await getRecipientEmail(watch.user_id);
  if (!email) {
    logger.warn("price-drop: no address for recipient; nothing sent", { watchId: watch.id });
    return { notified: false, reason: "no_recipient" };
  }

  const productName = watch.product_name ?? "The product you're watching";

  // Every figure below is a server-computed row: the reference is what the last
  // alert quoted, the rest is the observation this run just appended.
  const notification = await insertNotification({
    user_id: watch.user_id,
    channel: "email",
    event: "price_drop",
    payload: {
      watch_id: watch.id,
      product_name: productName,
      product_url: watch.product_url,
      previous_price_usd: decision.reference_price_usd,
      current_price_usd: reading.priceUsd,
      drop_pct: decision.drop_pct,
      current_total_ghs: reading.totalGhs,
      exchange_rate: reading.exchangeRate,
    },
  });

  const template = priceDropTemplate({
    productName,
    productUrl: watch.product_url,
    watchUrl: `${env.app.url}/app/orders/new?url=${encodeURIComponent(watch.product_url)}`,
    previousPriceUsd: decision.reference_price_usd,
    currentPriceUsd: reading.priceUsd,
    dropPct: decision.drop_pct,
    currentTotalGhs: reading.totalGhs,
    exchangeRate: reading.exchangeRate,
  });

  let delivered = false;
  try {
    await sendEmail({ to: email, subject: template.subject, html: template.html });
    delivered = true;
  } catch (error) {
    logger.error("price-drop: send failed", {
      watchId: watch.id,
      notificationId: notification.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  await markNotificationDelivered(notification.id, {
    status: delivered ? "sent" : "failed",
    sent_at: now.toISOString(),
  });

  // The reference moves whether or not the mail landed — see the note above.
  await markWatchNotified(watch.id, {
    notified_price_usd: reading.priceUsd,
    notified_at: now.toISOString(),
  });

  return {
    notified: true,
    reason: "drop",
    delivered,
    drop_pct: decision.drop_pct,
    reference_price_usd: decision.reference_price_usd,
  };
}

/**
 * `notifyPriceDrop` with delivery problems absorbed, for the batch job.
 *
 * A watch whose price genuinely fell has already been re-checked and recorded
 * successfully by the time this runs; failing the whole check because the
 * mailbox was unreachable would bump `consecutive_failures` on a healthy watch
 * and eventually retire it. A missing table is rethrown — that is the one class
 * of failure the run must not survive.
 */
export async function tryNotifyPriceDrop(
  watch: PriceWatchRow,
  reading: PriceDropReading,
  thresholdPct: number | null,
): Promise<PriceDropOutcome> {
  try {
    return await notifyPriceDrop(watch, reading, thresholdPct);
  } catch (error) {
    if (isSchemaMissingError(error)) throw error;
    logger.error("price-drop: notification failed", {
      watchId: watch.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return { notified: false, reason: "error" };
  }
}

function firstPositive(...values: (number | null | undefined)[]): number | null {
  for (const value of values) {
    // Postgres NUMERIC arrives as a string over PostgREST often enough to matter.
    const n = value == null ? NaN : Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}
