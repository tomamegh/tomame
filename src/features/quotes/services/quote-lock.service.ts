import "server-only";
import { logger } from "@/lib/logger";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { isSchemaMissingError } from "@/lib/supabase/errors";
import { priceExtractionWith, type PriceOverrides } from "@/features/extraction/quote.service";
import { loadPricingCalculator } from "@/features/pricing/services/pricing.service";
import { listGhsRates } from "@/lib/exchange-rates/service";
import type { ExtractionResult, Quote } from "@/features/extraction/types";
import type { FxOverride, PricingBreakdown, PricingCalculator } from "@/lib/pricing";
import {
  adoptSessionLocks,
  consumeActiveLocks,
  consumeLock,
  findActiveLock,
  insertQuoteLock,
  ratchetLockRate,
  type QuoteLockRow,
} from "@/db/queries/quote-locks";
import type { DeliveryWindow, QuoteConstants, Viewer } from "../types";
import { loadQuoteConstants, QuoteConstantsMissingError } from "./quote-constants.service";
import { loadDeliveryWindow, type EtaCountry } from "./delivery-eta.service";

// ── Public API ──────────────────────────────────────────────────────────────

export interface ApplyRateLockInput {
  viewer: Viewer;
  extraction: ExtractionResult;
  /** Null when the extraction never cached: nothing stable to lock against, so it is priced live. */
  extractionCacheId: string | null;
  quantity: number;
  overrides: PriceOverrides | null;
}

export interface LockedPricing {
  pricing: PricingBreakdown | null;
  reason: string | null;
}

/**
 * Price an extraction for a viewer, holding the FX for them.
 *
 *   live price → active lock?
 *     none          → mint one at today's FX (audit `quote_lock_minted`)
 *     locked total ≤ live total → the locked breakdown (the customer keeps the better deal)
 *     live total < locked total → ratchet the lock down to live (audit `quote_lock_ratcheted`)
 *
 * The lock is FX-only; the item price is always the live snapshot's. The lock's
 * `pricing` column is an informational snapshot and is never read as a price.
 *
 * Failure policy: a missing table or a missing seeded constant is a
 * deploy-before-migrate bug and surfaces; any other lock failure degrades to
 * the live price with an error logged — a customer can always get a quote.
 */
export async function applyRateLock(input: ApplyRateLockInput): Promise<LockedPricing> {
  return priceForViewer(input, { mint: true, eta: true });
}

/**
 * Price under the viewer's EXISTING lock, or live when they hold none. Never
 * mints — for surfaces that show a price without being a quote (the Home
 * receipt), so browsing does not create locks.
 */
export async function priceUnderExistingLock(input: ApplyRateLockInput): Promise<LockedPricing> {
  return priceForViewer(input, { mint: false, eta: false });
}

/**
 * The customer-facing quote: the extraction, priced under the viewer's lock
 * when it has a cache row, live otherwise.
 */
export async function quoteForViewer(
  extraction: ExtractionResult & { extraction_cache_id: string | null },
  quantity: number,
  viewer: Viewer,
): Promise<Quote> {
  const { pricing, reason } = await applyRateLock({
    viewer,
    extraction,
    extractionCacheId: extraction.extraction_cache_id,
    quantity,
    overrides: null,
  });
  return { ...extraction, pricing, pricing_unavailable_reason: reason };
}

/**
 * The viewer's active lock on an extraction, or null. Never mints. Looks the
 * user up first; only when that misses and the request also carries a quote
 * cookie are the session's anonymous locks adopted (audit `quote_lock_adopted`)
 * and the lookup repeated — so a customer who quoted signed-out and signed in
 * to pay keeps their rate, and a signed-in request that already has its lock
 * writes nothing.
 */
export async function resolveLockForOrder(viewer: Viewer, extractionCacheId: string, now = new Date()): Promise<QuoteLockRow | null> {
  if (!hasIdentity(viewer)) return null;
  const nowIso = now.toISOString();
  const own = await findActiveLock(viewer, extractionCacheId, nowIso);
  if (own || !viewer.userId || !viewer.sessionId) return own;
  const adopted = await adoptSessionLocksFor(viewer);
  return adopted.length > 0 ? findActiveLock(viewer, extractionCacheId, nowIso) : null;
}

export interface PriceLowerOfInput {
  lock: QuoteLockRow;
  /** Today's pricing of the same line, already computed. */
  live: PricingBreakdown;
  /** Price the same line under a frozen FX. */
  priceAt: (fx: FxOverride) => Promise<PricingBreakdown>;
  /**
   * What happens when live is the better deal. The quote and order paths
   * ratchet the lock down to live and keep the lock fields (the lock now IS the
   * live rate). An admin re-price of an already-consumed lock leaves the lock
   * alone and returns plain live pricing without lock fields.
   */
  onLiveWins: { ratchet: true; actorId: string | null } | { ratchet: false };
}

/**
 * Lower of locked and live — by TOTAL, not by the USD pair, so a GBP or CNY
 * listing is judged on what the customer actually pays. The one function the
 * quote, order-intake and admin-review paths all share.
 */
export async function priceLowerOf(input: PriceLowerOfInput): Promise<PricingBreakdown> {
  const { lock, live, priceAt, onLiveWins } = input;

  // Fast path: a USD line whose lock is already at today's pair prices identically.
  if (live.item_currency === "USD" && lock.exchange_rate === live.exchange_rate && lock.mid_market_rate === live.mid_market_rate) {
    return withLock(live, lock);
  }

  const locked = await priceAt(lockFx(lock));
  if (locked.total_ghs <= live.total_ghs) return withLock(locked, lock);

  if (!onLiveWins.ratchet) return live;
  await ratchetToLive(lock, live, onLiveWins.actorId);
  return withLock(live, lock);
}

/** A pricer over one extraction line, for `priceLowerOf`. Throws when pricing fails. */
export function extractionPricer(
  calculator: PricingCalculator,
  extraction: ExtractionResult,
  quantity: number,
  overrides: PriceOverrides | null,
): (fx: FxOverride) => Promise<PricingBreakdown> {
  return async (fx) => {
    const priced = await priceExtractionWith(calculator, extraction, quantity, overrides, fx);
    if (!priced.pricing) throw new Error(priced.reason ?? "Pricing under the locked rate failed.");
    return priced.pricing;
  };
}

/** The frozen FX a lock holds, in the calculator's shape. */
export function lockFx(lock: QuoteLockRow): FxOverride {
  return { exchange_rate: lock.exchange_rate, mid_market_rate: lock.mid_market_rate, cross_rates: lock.fx_rates };
}

export function withLock(pricing: PricingBreakdown, lock: QuoteLockRow): PricingBreakdown {
  return { ...pricing, rate_locked_until: lock.expires_at, rate_lock_id: lock.id };
}

/** True when the lock has not yet expired at `now`. */
export function isLockUnexpired(lock: QuoteLockRow, now = new Date()): boolean {
  return new Date(lock.expires_at).getTime() > now.getTime();
}

/**
 * Mark the order's lock spent — and every sibling lock the viewer holds on the
 * same extraction, so a racy double-mint leaves no second usable lock. Called
 * after the order row exists. Returns the ids consumed; each is audited.
 */
export async function consumeQuoteLocksForOrder(input: {
  viewer: Viewer;
  extractionCacheId: string | null;
  /** The lock the order was priced under. */
  lockId: string;
  orderId: string;
  actorId: string;
  exchangeRate: number;
}): Promise<string[]> {
  const nowIso = new Date().toISOString();
  const ids = input.extractionCacheId
    ? await consumeActiveLocks(input.viewer, input.extractionCacheId, input.orderId, nowIso)
    : [];
  if (!ids.includes(input.lockId) && (await consumeLock(input.lockId, input.orderId, nowIso)) > 0) {
    ids.push(input.lockId);
  }
  for (const id of ids) {
    await logAuditEvent({
      actorId: input.actorId,
      actorRole: "user",
      action: "quote_lock_consumed",
      entityType: "quote_lock",
      entityId: id,
      metadata: { exchange_rate: input.exchangeRate, order_id: input.orderId, priced_under: id === input.lockId },
    });
  }
  return ids;
}

/**
 * Attach the pre-purchase delivery window. Degrades to the bare breakdown when
 * the region has no transit days or the lookup fails — except a missing table
 * or a missing seeded constant, which surface.
 */
export async function withDeliveryEta(
  pricing: PricingBreakdown,
  country: EtaCountry | null,
  constants: QuoteConstants | null,
  today: Date,
): Promise<PricingBreakdown> {
  if (!country) return pricing;
  const window = await loadEta(country, constants ?? (await loadConstants()), today);
  return window ? { ...pricing, delivery_eta_from: window.from, delivery_eta_to: window.to } : pricing;
}

// ── Internals ───────────────────────────────────────────────────────────────

interface PriceForViewerOptions {
  mint: boolean;
  eta: boolean;
}

type LockLookup = { ok: true; lock: QuoteLockRow | null } | { ok: false; error: unknown };

async function priceForViewer(input: ApplyRateLockInput, opts: PriceForViewerOptions): Promise<LockedPricing> {
  const { viewer, extraction, extractionCacheId, quantity, overrides } = input;
  const now = new Date();
  const calculator = await loadPricingCalculator();
  const wantsLock = extractionCacheId != null && hasIdentity(viewer);

  // Live pricing, the lock lookup, the constants and the ETA are independent;
  // the calculator is loaded once and prices live and locked on the same instance.
  const constantsP: Promise<QuoteConstants | null> = opts.mint || opts.eta ? loadConstants() : Promise.resolve(null);
  const etaP: Promise<DeliveryWindow | null> =
    opts.eta && extraction.country ? constantsP.then((c) => loadEta(extraction.country as EtaCountry, c, now)) : Promise.resolve(null);
  const lockP: Promise<LockLookup | null> = wantsLock
    ? resolveLockForOrder(viewer, extractionCacheId, now).then(
        (lock): LockLookup => ({ ok: true, lock }),
        (error): LockLookup => ({ ok: false, error }),
      )
    : Promise.resolve(null);

  const [live, constants, eta, lookup] = await Promise.all([
    priceExtractionWith(calculator, extraction, quantity, overrides, null),
    constantsP,
    etaP,
    lockP,
  ]);
  if (!live.pricing) return live;

  let pricing = live.pricing;
  if (extractionCacheId && !hasIdentity(viewer)) {
    logger.warn("quote lock: viewer has no identity; pricing live without a lock", { extractionCacheId });
  } else if (extractionCacheId && lookup) {
    try {
      if (!lookup.ok) throw lookup.error;
      if (lookup.lock) {
        pricing = await priceLowerOf({
          lock: lookup.lock,
          live: live.pricing,
          priceAt: extractionPricer(calculator, extraction, quantity, overrides),
          onLiveWins: { ratchet: true, actorId: viewer.userId },
        });
      } else if (opts.mint && constants) {
        pricing = withLock(live.pricing, await mintLock({ viewer, extractionCacheId, quantity, live: live.pricing, constants, now }));
      }
    } catch (err) {
      rethrowIfLoud(err);
      logger.error("quote lock: failed, pricing live", {
        extractionCacheId,
        error: err instanceof Error ? err.message : String(err),
      });
      pricing = live.pricing;
    }
  }

  return { pricing: eta ? { ...pricing, delivery_eta_from: eta.from, delivery_eta_to: eta.to } : pricing, reason: null };
}

function hasIdentity(viewer: Viewer): boolean {
  return Boolean(viewer.userId || viewer.sessionId);
}

/** A missing table or a missing seeded constant must surface; everything else degrades. */
function rethrowIfLoud(err: unknown): void {
  if (isSchemaMissingError(err) || err instanceof QuoteConstantsMissingError) throw err;
}

async function loadConstants(): Promise<QuoteConstants | null> {
  try {
    return await loadQuoteConstants();
  } catch (err) {
    rethrowIfLoud(err);
    logger.error("quote: constants unavailable", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

async function loadEta(country: EtaCountry, constants: QuoteConstants | null, today: Date): Promise<DeliveryWindow | null> {
  if (!constants) return null;
  try {
    return await loadDeliveryWindow(country, constants, today);
  } catch (err) {
    rethrowIfLoud(err);
    logger.warn("quote: delivery ETA unavailable", { country, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

async function adoptSessionLocksFor(viewer: Viewer): Promise<string[]> {
  if (!viewer.userId || !viewer.sessionId) return [];
  const adopted = await adoptSessionLocks(viewer.sessionId, viewer.userId);
  for (const id of adopted) {
    await logAuditEvent({
      actorId: viewer.userId,
      actorRole: "user",
      action: "quote_lock_adopted",
      entityType: "quote_lock",
      entityId: id,
      metadata: { session_id: viewer.sessionId },
    });
  }
  return adopted;
}

async function mintLock(input: {
  viewer: Viewer;
  extractionCacheId: string;
  quantity: number;
  live: PricingBreakdown;
  constants: QuoteConstants;
  now: Date;
}): Promise<QuoteLockRow> {
  const { viewer, extractionCacheId, quantity, live, constants, now } = input;
  const expiresAt = new Date(now.getTime() + constants.rate_lock_hours * 60 * 60 * 1000);
  const fxRates = await listGhsRates();

  const lock = await insertQuoteLock({
    user_id: viewer.userId,
    session_id: viewer.sessionId,
    extraction_cache_id: extractionCacheId,
    quantity,
    exchange_rate: live.exchange_rate,
    mid_market_rate: live.mid_market_rate,
    fx_rates: fxRates,
    // Informational only — see QuoteLockRow.pricing.
    pricing: live,
    locked_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  });

  await logAuditEvent({
    actorId: viewer.userId,
    actorRole: viewer.userId ? "user" : "system",
    action: "quote_lock_minted",
    entityType: "quote_lock",
    entityId: lock.id,
    metadata: {
      extraction_cache_id: extractionCacheId,
      quantity,
      exchange_rate: live.exchange_rate,
      mid_market_rate: live.mid_market_rate,
      fx_currencies: Object.keys(fxRates),
      expires_at: lock.expires_at,
      anonymous: !viewer.userId,
    },
  });
  return lock;
}

/**
 * Ratchet the lock down to today's FX (rates and the cross-rate snapshot) and
 * audit it. The query is guarded to never move a rate up; when a concurrent
 * request already ratcheted, nothing changes and no audit row is written.
 */
async function ratchetToLive(lock: QuoteLockRow, live: PricingBreakdown, actorId: string | null): Promise<void> {
  const fxRates = await listGhsRates();
  const changed = await ratchetLockRate(lock.id, {
    exchange_rate: live.exchange_rate,
    mid_market_rate: live.mid_market_rate,
    fx_rates: fxRates,
  });
  if (!changed) return;
  await logAuditEvent({
    actorId,
    actorRole: actorId ? "user" : "system",
    action: "quote_lock_ratcheted",
    entityType: "quote_lock",
    entityId: lock.id,
    metadata: {
      extraction_cache_id: lock.extraction_cache_id,
      from_exchange_rate: lock.exchange_rate,
      to_exchange_rate: live.exchange_rate,
      from_mid_market_rate: lock.mid_market_rate,
      to_mid_market_rate: live.mid_market_rate,
      fx_currencies: Object.keys(fxRates),
    },
  });
}
