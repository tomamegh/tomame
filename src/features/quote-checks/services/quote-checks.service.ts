import "server-only";

import { after } from "next/server";

import { AUDIT_ACTOR_ROLES, AUDIT_ENTITY_TYPES } from "@/config/constants";
import { PRICE_REREAD_JOB } from "@/config/quote-checks";
import { whatsappHref } from "@/components/layout/marketing/links";
import { getExtractionById } from "@/db/queries/extraction-cache";
import {
  correctSnapshotPrice,
  getQuoteCheck,
  insertQuoteCheck,
  listQuoteCheckQueue,
  listQuoteChecksForExtractions,
  updateQuoteCheckFrom,
  type NewQuoteCheck,
  type QuoteCheckRow,
} from "@/db/queries/quote-checks";
import { getSiteSettingsMap } from "@/db/queries/site-settings";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { budgetPeriodOf, readJobBudget, spendJobBudget } from "@/features/catalog/services/catalog-budget";
import { checksNeeded, payHoldOf, type PayHold, type QuoteCheckKind, type QuoteCheckStatus } from "@/features/extraction/pay-gate";
import { judgeReread, PRICE_REASON_LABELS, type PriceConfidence } from "@/features/extraction/price-confidence";
import { rereadPrice } from "@/features/extraction/price-reread";
import { detectStockSignals, STOCK_CONFIRMATION_HOURS } from "@/features/extraction/stock-signals";
import type { ExtractionResult, StockCheckView } from "@/features/extraction/types";
import type { Viewer } from "@/features/quotes/types";
import { notifyStaff } from "@/features/staff-alerts/notify";
import { APIError } from "@/lib/auth/api-helpers";
import { logger } from "@/lib/logger";
import type { DecideQuoteCheckInput, ReportWrongPriceInput } from "../schema";

/**
 * Price and stock checks (plan A0, A7; migration 103): who opens them, what
 * runs in the background, and what staff decide. The rule that turns them
 * into "can this be paid?" is `features/extraction/pay-gate.ts`; this file
 * only loads its inputs and acts on its answers.
 */

/** A staff decision holds this long; then a new check is asked for. */
const DECISION_VALID_MS = STOCK_CONFIRMATION_HOURS * 3600_000;

// ── Reads ───────────────────────────────────────────────────────────────────

/**
 * Checks per extraction. A failed read degrades to "no checks", which can
 * only ADD holds (no confirmation is seen), never remove one.
 */
export async function checksByExtraction(ids: readonly string[]): Promise<Map<string, QuoteCheckRow[]>> {
  const out = new Map<string, QuoteCheckRow[]>();
  try {
    for (const row of await listQuoteChecksForExtractions(ids)) {
      const list = out.get(row.extraction_cache_id) ?? [];
      list.push(row);
      out.set(row.extraction_cache_id, list);
    }
  } catch (error) {
    logger.warn("quote checks: read failed, holding as unchecked", { error: error instanceof Error ? error.message : String(error) });
  }
  return out;
}

/** The pay hold for one extraction, from its stored checks. */
export async function payHoldFor(extractionCacheId: string | null, extraction: ExtractionResult): Promise<PayHold | null> {
  const checks = extractionCacheId ? (await checksByExtraction([extractionCacheId])).get(extractionCacheId) ?? [] : [];
  return payHoldOf({ extraction, checks });
}

export interface QuoteTrust {
  price_status: PriceConfidence | null;
  stock_check: StockCheckView | null;
  pay_hold: PayHold | null;
}

/** What the quote screen shows about trust: confidence, the stock check, the hold. */
export async function quoteTrustFor(extractionCacheId: string | null, extraction: ExtractionResult): Promise<QuoteTrust> {
  const checks = extractionCacheId ? (await checksByExtraction([extractionCacheId])).get(extractionCacheId) ?? [] : [];
  const pay_hold = payHoldOf({ extraction, checks });
  const stock_check = extractionCacheId ? await stockCheckView(extractionCacheId, extraction, checks) : null;
  return { price_status: extraction.price_confidence?.level ?? null, stock_check, pay_hold };
}

/** "Q-1A2B3C4D": the reference a customer quotes on WhatsApp and staff search for. */
export function quoteReference(extractionCacheId: string): string {
  return `Q-${extractionCacheId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

async function supportNumber(): Promise<string | null> {
  try {
    const raw = (await getSiteSettingsMap()).whatsapp_number;
    return typeof raw === "string" ? raw : null;
  } catch (error) {
    logger.warn("quote checks: whatsapp number unavailable", { error: String(error) });
    return null;
  }
}

/** `wa.me` link with the item and quote reference typed in for the customer. */
export function stockWhatsappUrl(number: string | null, title: string | null, reference: string): string | null {
  const base = whatsappHref(number);
  if (!base) return null;
  const text = `Hi Tomame, please confirm stock and condition for: ${title ?? "my item"} (quote ref ${reference}).`;
  return `${base}?text=${encodeURIComponent(text)}`;
}

async function stockCheckView(extractionCacheId: string, extraction: ExtractionResult, checks: readonly QuoteCheckRow[]): Promise<StockCheckView | null> {
  const signals = detectStockSignals(extraction.product);
  if (signals.length === 0) return null;
  const now = Date.now();
  const latest = checks.find((c) => c.kind === "stock" && c.origin === "system") ?? null;
  const valid = (c: QuoteCheckRow) => c.valid_until == null || Date.parse(c.valid_until) > now;
  const status: StockCheckView["status"] =
    latest?.status === "confirmed" && valid(latest)
      ? "confirmed"
      : latest?.status === "unavailable" && valid(latest)
        ? "unavailable"
        : latest?.status === "pending"
          ? "requested"
          : "needed";
  const reference = quoteReference(extractionCacheId);
  return {
    reasons: signals.map((s) => s.label),
    status,
    valid_until: status === "confirmed" || status === "unavailable" ? latest?.valid_until ?? null : null,
    substitute_url: status === "unavailable" ? latest?.substitute_url ?? null : null,
    whatsapp_url: stockWhatsappUrl(await supportNumber(), extraction.product.title, reference),
    reference,
  };
}

// ── Opening checks ──────────────────────────────────────────────────────────

function baseRow(extractionCacheId: string, productUrl: string, extraction: ExtractionResult, viewer: Viewer): Omit<NewQuoteCheck, "kind" | "origin" | "status" | "reasons"> {
  return {
    extraction_cache_id: extractionCacheId,
    product_url: productUrl,
    product_title: extraction.product.title,
    platform: extraction.platform,
    quoted_price: extraction.product.price,
    quoted_currency: extraction.product.currency,
    price_source: typeof extraction.price_source === "string" ? extraction.price_source : null,
    user_id: viewer.userId,
    session_id: viewer.sessionId,
  };
}

function runAfter(work: () => Promise<void>): void {
  const guarded = async () => {
    try {
      await work();
    } catch (error) {
      logger.error("quote checks: background work failed", { error: error instanceof Error ? error.message : String(error) });
    }
  };
  try {
    after(guarded);
  } catch {
    void guarded();
  }
}

async function opened(row: QuoteCheckRow, actorId: string | null): Promise<void> {
  await logAuditEvent({
    actorId,
    actorRole: actorId ? AUDIT_ACTOR_ROLES.USER : AUDIT_ACTOR_ROLES.SYSTEM,
    action: "quote_check_opened",
    entityType: AUDIT_ENTITY_TYPES.QUOTE_CHECK,
    entityId: row.id,
    metadata: { kind: row.kind, origin: row.origin, status: row.status, extraction_cache_id: row.extraction_cache_id, reasons: row.reasons, quoted_price: row.quoted_price },
  });
  // Every check a person must work is an alert; an automatic re-read is not (yet).
  if (row.status === "pending") notifyStaff({ kind: "quote_check", checkId: row.id });
}

/**
 * Open whatever checks this extraction needs before it can be paid for:
 * a stock check, a staff price check, or an automatic price re-read (run
 * after the response). Called when a line enters the bag and when the
 * customer asks for a stock check. Idempotent: the unique indexes of 103
 * turn a concurrent second open into a no-op. Never throws.
 */
export async function ensureQuoteChecks(viewer: Viewer, extractionCacheId: string, productUrl: string, extraction: ExtractionResult): Promise<void> {
  try {
    const checks = (await checksByExtraction([extractionCacheId])).get(extractionCacheId) ?? [];
    const needed = checksNeeded({ extraction, checks });
    const base = baseRow(extractionCacheId, productUrl, extraction, viewer);

    if (needed.stock) {
      const row = await insertQuoteCheck({ ...base, kind: "stock", origin: "system", status: "pending", reasons: detectStockSignals(extraction.product).map((s) => s.label) });
      if (row) await opened(row, viewer.userId);
    }
    if (needed.price) {
      const reasons = (extraction.price_confidence?.reasons ?? []).map((r) => PRICE_REASON_LABELS[r] ?? r);
      const row = await insertQuoteCheck({ ...base, kind: "price", origin: "system", status: needed.price, reasons });
      if (row) {
        await opened(row, viewer.userId);
        if (row.status === "checking") runAfter(() => runPriceReread(row.id));
      }
    }
  } catch (error) {
    logger.error("quote checks: could not open checks", { extractionCacheId, error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * A system stock check with reasons the caller found (the finder's "price far
 * below other new listings"). Pay waits on it like any stock check. One open
 * system check per product and kind, so a repeat is a no-op.
 */
export async function openSellerCheck(viewer: Viewer, extractionCacheId: string, productUrl: string, extraction: ExtractionResult, reasons: string[]): Promise<void> {
  try {
    const checks = (await checksByExtraction([extractionCacheId])).get(extractionCacheId) ?? [];
    if (checks.some((c) => c.kind === "stock" && c.status === "pending")) return;
    const row = await insertQuoteCheck({ ...baseRow(extractionCacheId, productUrl, extraction, viewer), kind: "stock", origin: "system", status: "pending", reasons });
    if (row) await opened(row, viewer.userId);
  } catch (error) {
    logger.error("quote checks: could not open a seller check", { extractionCacheId, error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * The automatic re-read of a single-source price. Agreeing → confirmed for
 * 24 h; disagreeing → waits on staff (alerted); nothing read or no budget →
 * lapsed, and the price is payable as it stands. Guarded on `checking`, so a
 * staff decision made meanwhile is never overwritten.
 */
export async function runPriceReread(checkId: string): Promise<void> {
  const check = await getQuoteCheck(checkId);
  if (!check || check.status !== "checking" || check.quoted_price == null) return;
  const now = new Date();
  const lapse = async (why: string) => {
    const row = await updateQuoteCheckFrom(check.id, "checking", { status: "lapsed", reasons: [...check.reasons, why] });
    if (row) await audit(row, null, "quote_check_reread", { outcome: "lapsed", why });
  };

  const period = budgetPeriodOf(now);
  const budget = await readJobBudget(PRICE_REREAD_JOB.jobName, PRICE_REREAD_JOB.monthlyCaps, period);
  if (budget.used >= budget.cap) return lapse("Re-read budget used up this month");

  const snapshot = await getExtractionById(check.extraction_cache_id);
  if (!snapshot) return lapse("Quote no longer stored");
  await spendJobBudget(PRICE_REREAD_JOB.jobName, PRICE_REREAD_JOB.monthlyCaps, period);
  const reads = await rereadPrice({
    url: snapshot.productUrl,
    title: snapshot.result.product.title,
    category: snapshot.result.product.category,
    originalSource: check.price_source,
    budgetMs: PRICE_REREAD_JOB.budgetMs,
  });
  const verdict = judgeReread({ price: check.quoted_price, currency: check.quoted_currency }, reads);
  if (verdict.outcome === "none") return lapse("No other tier could read the price");

  const reread = { reread_price: verdict.read.price, reread_currency: verdict.read.currency, reread_source: verdict.read.source, reread_at: new Date().toISOString() };
  if (verdict.outcome === "agree") {
    const row = await updateQuoteCheckFrom(check.id, "checking", {
      ...reread,
      status: "confirmed",
      confirmed_price: check.quoted_price,
      decided_at: reread.reread_at,
      valid_until: new Date(Date.now() + DECISION_VALID_MS).toISOString(),
    });
    if (row) await audit(row, null, "quote_check_reread", { outcome: "agree", reread_price: verdict.read.price, via: verdict.read.source });
    return;
  }
  const row = await updateQuoteCheckFrom(check.id, "checking", {
    ...reread,
    status: "pending",
    reasons: [...check.reasons, `Re-read via ${verdict.read.source} says ${verdict.read.price}`],
  });
  if (row) {
    await audit(row, null, "quote_check_reread", { outcome: "disagree", reread_price: verdict.read.price, via: verdict.read.source });
    notifyStaff({ kind: "quote_check", checkId: row.id });
  }
}

async function audit(row: QuoteCheckRow, actorId: string | null, action: string, metadata: Record<string, unknown>): Promise<void> {
  await logAuditEvent({
    actorId,
    actorRole: actorId ? AUDIT_ACTOR_ROLES.ADMIN : AUDIT_ACTOR_ROLES.SYSTEM,
    action,
    entityType: AUDIT_ENTITY_TYPES.QUOTE_CHECK,
    entityId: row.id,
    metadata: { kind: row.kind, status: row.status, extraction_cache_id: row.extraction_cache_id, ...metadata },
  });
}

// ── Customer actions ────────────────────────────────────────────────────────

async function loadForCustomer(extractionCacheId: string): Promise<{ productUrl: string; result: ExtractionResult }> {
  const snapshot = await getExtractionById(extractionCacheId);
  if (!snapshot) throw new APIError(404, "We have no record of that quote");
  return { productUrl: snapshot.productUrl, result: snapshot.result };
}

/**
 * "Confirm stock": opens the stock check if the quote needs one (staff are
 * alerted), and returns what the customer sees, including the WhatsApp link.
 */
export async function requestStockCheck(viewer: Viewer, extractionCacheId: string): Promise<StockCheckView | null> {
  const { productUrl, result } = await loadForCustomer(extractionCacheId);
  if (detectStockSignals(result.product).length === 0) return null;
  await ensureQuoteChecks(viewer, extractionCacheId, productUrl, result);
  const checks = (await checksByExtraction([extractionCacheId])).get(extractionCacheId) ?? [];
  return stockCheckView(extractionCacheId, result, checks);
}

/** "Report a wrong price": a customer row in the price queue and a staff alert. Never changes a price or a hold. */
export async function reportWrongPrice(viewer: Viewer, extractionCacheId: string, input: ReportWrongPriceInput): Promise<{ id: string | null; reference: string }> {
  const { productUrl, result } = await loadForCustomer(extractionCacheId);
  const reasons = ["Reported by a customer"];
  const row = await insertQuoteCheck({
    ...baseRow(extractionCacheId, productUrl, result, viewer),
    kind: "price",
    origin: "customer",
    status: "pending",
    reasons,
    customer_note: input.note?.trim() || null,
    reported_price: input.seen_price ?? null,
  });
  if (row) await opened(row, viewer.userId);
  return { id: row?.id ?? null, reference: quoteReference(extractionCacheId) };
}

// ── Staff ───────────────────────────────────────────────────────────────────

export async function listQuoteChecks(kind: QuoteCheckKind, status?: QuoteCheckStatus): Promise<QuoteCheckRow[]> {
  return listQuoteCheckQueue(kind, status);
}

/** The status each staff action moves a check to. */
const ACTION_STATUS = { confirm: "confirmed", correct: "corrected", unavailable: "unavailable", dismiss: "dismissed" } as const;

/**
 * A staff decision on one open check, guarded on the status they saw.
 *   confirm      price or stock is right, valid 24 h
 *   correct      (price) the store's real price is written into the quote snapshot
 *   unavailable  (stock) the item cannot be bought; optional substitute link
 *   dismiss      (customer reports) nothing to change
 * Every decision is audited; a correction also audits the snapshot change.
 */
export async function decideQuoteCheck(adminId: string, id: string, input: DecideQuoteCheckInput): Promise<QuoteCheckRow> {
  const check = await getQuoteCheck(id);
  if (!check) throw new APIError(404, "Check not found");
  if (check.status !== input.from) throw new APIError(409, "Someone else already decided this one. Refresh the queue.");
  if (check.status !== "pending") throw new APIError(409, "Only an open check can be decided");
  if (input.action === "unavailable" && check.kind !== "stock") throw new APIError(400, "Only a stock check can be marked unavailable");
  if (input.action === "correct" && check.kind !== "price") throw new APIError(400, "Only a price check can be corrected");
  if (input.action === "dismiss" && check.origin !== "customer") throw new APIError(400, "Only a customer report can be dismissed; confirm or correct the price instead");

  const now = new Date();
  const snapshot = await getExtractionById(check.extraction_cache_id);
  const currentPrice = snapshot?.result.product.price ?? null;
  let confirmedPrice: number | null = null;

  if (check.kind === "price" && input.action === "confirm") {
    if (currentPrice == null) throw new APIError(409, "This quote has no price to confirm; correct it instead");
    confirmedPrice = currentPrice;
  }
  if (input.action === "correct") {
    if (input.price == null) throw new APIError(400, "Enter the price the store shows");
    if (!snapshot) throw new APIError(409, "This quote is no longer stored");
    confirmedPrice = input.price;
    if (currentPrice !== input.price) {
      const written = currentPrice != null && (await correctSnapshotPrice(check.extraction_cache_id, currentPrice, (r) => correctedResult(r, input.price!)));
      if (!written) throw new APIError(409, "The quote changed while you were looking. Refresh and check again.");
      await logAuditEvent({
        actorId: adminId,
        actorRole: AUDIT_ACTOR_ROLES.ADMIN,
        action: "extraction_price_corrected",
        entityType: AUDIT_ENTITY_TYPES.EXTRACTION,
        entityId: check.extraction_cache_id,
        metadata: { quote_check_id: check.id, from_price: currentPrice, to_price: input.price, currency: snapshot.result.product.currency },
      });
    }
  }

  const row = await updateQuoteCheckFrom(check.id, "pending", {
    status: ACTION_STATUS[input.action],
    decided_by: adminId,
    decided_at: now.toISOString(),
    decision_note: input.note?.trim() || null,
    confirmed_price: confirmedPrice,
    substitute_url: input.action === "unavailable" ? input.substitute_url ?? null : null,
    valid_until: input.action === "dismiss" ? null : new Date(now.getTime() + DECISION_VALID_MS).toISOString(),
  });
  if (!row) throw new APIError(409, "Someone else already decided this one. Refresh the queue.");
  await audit(row, adminId, "quote_check_decided", { action: input.action, confirmed_price: confirmedPrice, substitute_url: row.substitute_url, origin: row.origin });
  return row;
}

/** The snapshot after a staff price correction: the price, its source, and a confirmed verdict. */
export function correctedResult(result: ExtractionResult, price: number): ExtractionResult {
  return {
    ...result,
    product: { ...result.product, price },
    price_source: "staff",
    price_confidence: { level: "confirmed", reasons: ["exact_offer"], source: null },
  };
}
