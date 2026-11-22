import "server-only";

import type { FinderStore } from "@/features/finder/store-id";
import { FINDER } from "@/config/finder";
import { getExtractionSnapshot, extractPrepared, prepareProductUrl, type FreshExtraction } from "@/features/extraction/extraction.service";
import {
  claimFinderRun,
  completeFinderRun,
  findRecentFinderRun,
  getFinderRunById,
  getFinderRunForViewer,
  insertFinderRun,
  listStalePendingFinderRuns,
  reclaimStaleFinderRuns,
  requeueFinderRun,
  saveFinderProgress,
  updateFinderRunContact,
  type FinderRunRow,
} from "@/db/queries/finder-runs";
import type { RequestViewer } from "@/db/queries/extraction-requests";
import { getRegionByCode } from "@/db/queries/regions";
import { getSiteSettingsMap } from "@/db/queries/site-settings";
import { createAssistedRequest } from "@/features/assisted/services/assisted.service";
import { selectAccountProfile } from "@/db/queries/profiles";
import { createAdminClient } from "@/lib/supabase/admin";
import { payHoldOf, type PayHold } from "@/features/extraction/pay-gate";
import { priceExtractionWith } from "@/features/extraction/quote.service";
import type { ExtractionResult } from "@/features/extraction/types";
import { freightCheckPending } from "@/features/pricing/freight-inspection";
import { loadDisplayPricingCalculator, loadPricingCalculator } from "@/features/pricing/services/pricing.service";
import { checksByExtraction } from "@/features/quote-checks/services/quote-checks.service";
import { APIError } from "@/lib/auth/api-helpers";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { isPayablePricing } from "@/lib/pricing/payable";
import { isSchemaMissingError } from "@/lib/supabase/errors";

import {
  buyerHandoffText,
  compareSummary,
  FinderNarrator,
  freightSummary,
  nothingFoundMessage,
  priceSummary,
  searchDetails,
  searchStartedLabel,
  searchSummary,
  shortlistSummary,
  type StoreSearchOutcome,
} from "../narration";
import { rankCandidates, toFinderQuote, type RankInput } from "../ranking";
import { isSuspiciouslyLow, outlierReference } from "../price-outlier";
import { wideSpread } from "../spec-spread";
import { priceContextOf, type PriceContext } from "@/features/extraction/price-context";
import { QUICK_PICK_TRIES, quickPickOrder, quickPickReason, saysInStock } from "../quick-pick";
import { dropDetails, isClearlyOverBudget, isNotNew, isRiskyListing, keywordMatches, mergeDrops, postFilterListings, type DropReason, type FinderListing } from "../shortlist";
import { normaliseFinderQuery, specSummary, storedSpec, type ParsedFinderSpec } from "../spec";
import { finderAllowedStores, finderStoreName, mergeListings, pickSearchStores } from "../stores";
import type { FinderEvent, FinderQuote, FinderRunView } from "../types";
import { explainSpecSpread, shortlistListings, understandRequest, type TokenUsage } from "./finder-ai.service";
import { finderRecipient, finderRunPath, notifyFinderFinished } from "./finder-notify.service";
import { estimateLandedGhs, planFinderStores, searchFinderCatalogue, searchFinderStore, type StoreSearchResult } from "./finder-search.service";

/**
 * The AI price finder's job (migration 105).
 *
 * A run is a row. `startFinderRun` writes it and returns; the route starts
 * `runFinderJob` with `after()`, and the cron sweep re-drives any run a deploy
 * or crash dropped. The claim is a guarded `pending → running`, so the two can
 * race safely (the paste queue's shape, 049).
 *
 *   understand (Haiku) → catalogue + store search → shortlist (Haiku, ids only)
 *   → extraction chain for the top three → freight + calculator → rank → email
 *
 * THE AI NEVER SETS A PRICE. The model reads the request and picks listing
 * ids. Every GH₵ figure is the calculator's, over the same server snapshot a
 * pasted link gets, and a price the store has not confirmed is never "best".
 *
 * Every step appends an event saying what actually happened; the run screen
 * replays them through the same reducer the design preview uses.
 */

// ── Starting a run ──────────────────────────────────────────────────────────

export class FinderNotAdmittedError extends Error {
  constructor() {
    super("Finder run not admitted");
    this.name = "FinderNotAdmittedError";
  }
}

export interface StartFinderInput {
  query: string;
  budgetGhs: number | null;
  email: string | null;
  notifyWhatsapp: boolean;
}

/**
 * The same request from the same viewer inside the cache window returns the
 * earlier run and costs nothing. Otherwise `admit` (the route's rate limit)
 * decides, and only then is a row written.
 */
export async function startFinderRun(
  viewer: RequestViewer,
  input: StartFinderInput,
  admit: () => Promise<boolean>,
): Promise<{ run: FinderRunRow; reused: boolean }> {
  if (!viewer.userId && !viewer.sessionId) throw new APIError(400, "We could not tell whose search this is. Reload and try again.");
  const query = input.query.replace(/\s+/g, " ").trim();
  const queryKey = normaliseFinderQuery(query, input.budgetGhs);

  const since = new Date(Date.now() - FINDER.cacheHours * 3600_000).toISOString();
  const recent = await findRecentFinderRun(viewer, queryKey, since);
  if (recent) {
    const contact = await applyContact(recent, viewer, { email: input.email, notifyWhatsapp: input.notifyWhatsapp || undefined });
    return { run: contact, reused: true };
  }

  if (!(await admit())) throw new FinderNotAdmittedError();

  const run = await insertFinderRun({
    viewer,
    query,
    queryKey,
    budgetGhs: input.budgetGhs,
    email: input.email,
    notifyWhatsapp: input.notifyWhatsapp,
    events: [{ type: "run_started", at: 0, query, budgetGhs: input.budgetGhs }],
  });
  return { run, reused: false };
}

async function applyContact(run: FinderRunRow, viewer: RequestViewer, patch: { email?: string | null; notifyWhatsapp?: boolean }): Promise<FinderRunRow> {
  const changes: { email?: string | null; notifyWhatsapp?: boolean } = {};
  if (patch.email && patch.email !== run.email) changes.email = patch.email;
  if (patch.notifyWhatsapp !== undefined && patch.notifyWhatsapp !== run.notify_whatsapp) changes.notifyWhatsapp = patch.notifyWhatsapp;
  if (Object.keys(changes).length === 0) return run;
  return (await updateFinderRunContact(run.id, viewer, changes)) ?? run;
}

// ── Reading a run ───────────────────────────────────────────────────────────

async function buyerWhatsappNumber(): Promise<string | null> {
  try {
    const raw = (await getSiteSettingsMap()).whatsapp_number;
    return typeof raw === "string" && raw.trim() ? raw : null;
  } catch (error) {
    logger.warn("finder: whatsapp number unavailable", { error: String(error) });
    return null;
  }
}

/**
 * The run as the screen reads it. `lite` is the 2-second poll: it skips the
 * account-email and site-settings reads (they do not change while a run
 * works) and the screen keeps the values it already holds.
 */
export async function toFinderRunView(run: FinderRunRow, options: { lite?: boolean; now?: number } = {}): Promise<FinderRunView> {
  const now = options.now ?? Date.now();
  const [buyer, email] = options.lite
    ? [null, run.email]
    : await Promise.all([buyerWhatsappNumber(), finderRecipient(run).catch(() => run.email)]);
  const started = Date.parse(run.started_at ?? run.created_at);
  const ended = run.finished_at ? Date.parse(run.finished_at) : now;
  return {
    id: run.id,
    status: run.status,
    query: run.query,
    events: run.events,
    email,
    emailEditable: !run.user_id,
    notifyWhatsapp: run.notify_whatsapp,
    elapsedMs: Number.isFinite(started) ? Math.max(0, ended - started) : 0,
    buyerWhatsappNumber: buyer,
  };
}

export async function getFinderRunView(id: string, viewer: RequestViewer, options: { lite?: boolean } = {}): Promise<FinderRunView | null> {
  const run = await getFinderRunForViewer(id, viewer);
  return run ? toFinderRunView(run, options) : null;
}

/**
 * The viewer changes where the result goes (an address, the WhatsApp switch).
 * Returns the run, and whether a finished run now has an email to send.
 */
export async function updateFinderContact(
  id: string,
  viewer: RequestViewer,
  patch: { email?: string | null; notifyWhatsapp?: boolean },
): Promise<{ view: FinderRunView; sendNow: FinderRunRow | null }> {
  const run = await getFinderRunForViewer(id, viewer);
  if (!run) throw new APIError(404, "We have no record of that search.");
  // An account's result goes to the account's own address; only a visitor types one.
  if (patch.email !== undefined && run.user_id) delete patch.email;
  const updated = Object.keys(patch).length ? (await updateFinderRunContact(run.id, viewer, patch)) ?? run : run;
  const finished = updated.status === "done" || updated.status === "no_match" || updated.status === "failed";
  return { view: await toFinderRunView(updated), sendNow: finished && !updated.emailed_at && updated.email ? updated : null };
}

export async function sendFinderEmail(run: FinderRunRow): Promise<void> {
  await notifyFinderFinished(run, await buyerWhatsappNumber());
}

/**
 * "Ask a buyer": the customer tapped the WhatsApp hand-off. Only now is an
 * assisted request written, so a buyer's queue holds requests people chose to
 * send, with the run page as the link and the request as they typed it.
 */
export async function handOffFinderRun(id: string, viewer: RequestViewer): Promise<{ whatsappHref: string | null }> {
  const run = await getFinderRunForViewer(id, viewer);
  if (!run) throw new APIError(404, "We have no record of that search.");
  const profile = run.user_id ? await selectAccountProfile(createAdminClient(), run.user_id).catch(() => null) : null;
  const owner = { userId: run.user_id, sessionId: run.session_id };
  const request = await createAssistedRequest(owner, {
    product_url: `${env.app.url}${finderRunPath(run.id)}`,
    description: buyerHandoffText(run.query, run.budget_ghs, run.id),
    // A visitor has no number on file; they are writing from WhatsApp, which shows the buyer theirs.
    phone: profile?.phone?.trim() || "WhatsApp (see chat)",
  });
  return { whatsappHref: request.whatsapp_href };
}

/**
 * The matches to read at the store: the cheapest listed ones, keeping one slot
 * for the model's best match among those whose search row had no price (Amazon
 * hides some, and its own offer is often the cheapest).
 */
export function pickPriceCandidates(ranked: readonly FinderListing[], n: number): FinderListing[] {
  const priced = ranked.filter((l) => l.priceUsd != null && l.priceUsd > 0);
  const unpriced = ranked.filter((l) => !(l.priceUsd != null && l.priceUsd > 0));
  if (unpriced.length === 0 || n < 2) return ranked.slice(0, n);
  const out = [...priced.slice(0, n - 1), unpriced[0]!];
  for (const l of [...priced.slice(n - 1), ...unpriced.slice(1)]) if (out.length < n) out.push(l);
  return out;
}

// ── The job ─────────────────────────────────────────────────────────────────

/** Writes the narration in order: each write carries every event so far, one write at a time. */
class ProgressWriter {
  private chain: Promise<void> = Promise.resolve();
  private spec: Record<string, unknown> | null | undefined;
  constructor(
    private readonly runId: string,
    private readonly narrator: FinderNarrator,
    private readonly searches: () => number,
  ) {}
  setSpec(spec: Record<string, unknown>) {
    this.spec = spec;
  }
  save(): Promise<void> {
    this.chain = this.chain.then(() =>
      saveFinderProgress(this.runId, { events: [...this.narrator.events], spec: this.spec, vendorSearches: this.searches() }),
    );
    return this.chain;
  }
  async flush(): Promise<void> {
    await this.chain;
  }
}

interface PricedCandidate {
  listing: FinderListing;
  cacheId: string | null;
  quote: FinderQuote | null;
  state: RankInput["state"] | "dropped";
}

interface PipelineOutcome {
  status: "done" | "no_match";
  result: Record<string, unknown> | null;
}

function withTimeout<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), Math.max(0, ms));
  });
  return Promise.race([work, timeout]).finally(() => timer && clearTimeout(timer));
}

async function usLaneOpen(): Promise<boolean> {
  try {
    const region = await getRegionByCode("USA");
    return region?.status === "live";
  } catch (error) {
    // A failed read of the lanes must not close the finder; the registry still fences stores.
    logger.warn("finder: could not read the US lane", { error: String(error) });
    return true;
  }
}

/** Freight already checked, or checked now within the time left. Never throws. */
async function settleFreight(extraction: FreshExtraction, cacheId: string, msLeft: number): Promise<ExtractionResult | null> {
  if (freightCheckPending(extraction.freight_inspection) && extraction.checkFreight) {
    await withTimeout(extraction.checkFreight().catch(() => undefined), Math.min(FINDER.freightCheckTimeoutMs, msLeft), undefined);
  }
  const snapshot = await getExtractionSnapshot(cacheId).catch(() => null);
  return snapshot?.result ?? extraction;
}

/** The pay rule, without its freight half: the price step's own verdict. */
function priceHold(result: ExtractionResult, checks: Parameters<typeof payHoldOf>[0]["checks"]): PayHold | null {
  return payHoldOf({ extraction: { ...result, freight_inspection: undefined }, checks });
}

interface QuickPick {
  listing: FinderListing;
  cacheId: string;
  quote: FinderQuote;
  priceContext: PriceContext | null;
}

/**
 * The fast answer (see quick-pick.ts): an exact match we had already priced,
 * from Amazon or Walmart, read again now and only kept when the store says it
 * is in stock, nothing holds payment, and the calculator prices it. Never
 * throws; null when there is nothing good enough to offer quickly.
 */
async function findQuickPick(
  run: FinderRunRow,
  spec: ParsedFinderSpec,
  allowed: ReadonlySet<FinderStore>,
  catalogue: Promise<FinderListing[]>,
  msLeft: () => number,
  usage: TokenUsage,
): Promise<QuickPick | null> {
  try {
    const rows = (await catalogue).filter((l) => allowed.has(l.store));
    const trusted = quickPickOrder(rows, spec, allowed, () => true);
    if (trusted.length === 0) return null;
    // "PS5 Pro" is "PlayStation 5 Pro Console" to Amazon: the model judges the match, the word test stands in when it cannot.
    const picked = await withTimeout(shortlistListings(spec, trusted, usage), FINDER.quickPickShortlistMs, null);
    const exact = new Set((picked?.matches ?? keywordMatches(spec, trusted)).map((l) => l.id));
    const order = quickPickOrder(rows, spec, allowed, (l) => exact.has(l.id));
    const calculator = order.length > 0 ? await loadPricingCalculator() : null;
    for (const l of order.slice(0, QUICK_PICK_TRIES)) {
      const prepared = await prepareProductUrl(l.productUrl);
      const read = extractPrepared(prepared, { userId: null, sessionId: null });
      const extraction = await withTimeout<FreshExtraction | null>(read, Math.min(FINDER.quickPickReadMs, Math.max(0, msLeft() - 30_000)), null);
      const cacheId = extraction?.extraction_cache_id;
      if (!extraction || !cacheId || extraction.product.price == null) continue;
      if (!saysInStock(extraction.product.availability)) continue;
      if (isNotNew({ title: extraction.product.title ?? l.title, condition: extraction.product.condition ?? null })) continue;
      // A fresh read often has its freight still being checked; wait for it, as the full search does.
      const snapshot = (await settleFreight(extraction, cacheId, Math.min(FINDER.freightCheckTimeoutMs, msLeft() - 20_000))) ?? extraction;
      const checks = await checksByExtraction([cacheId]);
      if (payHoldOf({ extraction: snapshot, checks: checks.get(cacheId) ?? [] })) continue;
      const { pricing } = await priceExtractionWith(calculator!, snapshot, 1, null, null);
      if (!isPayablePricing(pricing)) continue;
      return { listing: l, cacheId, quote: toFinderQuote(pricing), priceContext: priceContextOf(snapshot) };
    }
    return null;
  } catch (error) {
    logger.warn("finder: quick pick failed", { runId: run.id, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

function quickCandidate(q: QuickPick) {
  return {
    id: q.listing.id,
    title: q.listing.title,
    store: { id: q.listing.store, name: finderStoreName(q.listing.store) },
    productUrl: q.listing.productUrl,
    imageUrl: q.listing.imageUrl,
    condition: "New" as const,
    listingPriceUsd: q.listing.priceUsd ?? 0,
    seller: q.listing.seller,
  };
}

async function runPipeline(run: FinderRunRow, narrator: FinderNarrator, writer: ProgressWriter, spent: { searches: number }, usage: TokenUsage, startedAt: number): Promise<PipelineOutcome> {
  const msLeft = () => FINDER.deadlineMs - (Date.now() - startedAt);
  let quickPromise: Promise<QuickPick | null> = Promise.resolve(null);
  const settledQuick = () => withTimeout(quickPromise, Math.max(0, msLeft() - 5_000), null);
  const handoff = async (message: string): Promise<PipelineOutcome> => {
    // The full search came up empty, but the fast answer stands: give that.
    const quick = await settledQuick();
    if (quick) {
      const c = quickCandidate(quick);
      narrator.emit({ type: "candidate_found", candidate: c });
      narrator.emit({ type: "candidate_priced", candidateId: c.id, quote: quick.quote, priceContext: quick.priceContext, stockCheck: false, extractionCacheId: quick.cacheId });
      narrator.emit({ type: "result_ready", bestId: c.id, alternativeIds: [], why: { [c.id]: `In stock at ${c.store.name}, new, price confirmed` } });
      return {
        status: "done",
        result: { bestId: c.id, alternativeIds: [], candidates: [{ id: c.id, store: quick.listing.store, extractionCacheId: quick.cacheId, state: "priced", totalGhs: quick.quote.totalGhs }], quick: true, tokens: usage },
      };
    }
    narrator.emit({ type: "nothing_found", message, whatsappText: buyerHandoffText(run.query, run.budget_ghs, run.id) });
    return { status: "no_match", result: null };
  };

  // 1. Understand ─────────────────────────────────────────────────────────
  narrator.emit({ type: "step_started", step: "understand", label: "Reading your request" });
  await writer.save();
  // A chat turn has already read the request into one item; a one-line request is read here.
  const spec: ParsedFinderSpec | null = storedSpec(run.spec) ?? (await understandRequest(run.query, run.budget_ghs, usage));
  if (!spec) {
    narrator.emit({ type: "step_done", step: "understand", summary: "We could not tell which product you mean" });
    return handoff(nothingFoundMessage(null, [], "not_understood"));
  }
  narrator.emit({ type: "spec_parsed", spec: { product: spec.product, mustHaves: spec.mustHaves, budgetGhs: spec.budgetGhs, newOnly: true } });
  narrator.emit({ type: "step_done", step: "understand", summary: specSummary(spec) });
  writer.setSpec({ ...spec });
  await writer.save();

  // 2. Search ─────────────────────────────────────────────────────────────
  const allowed = finderAllowedStores(await usLaneOpen());
  const wanted = pickSearchStores(`${run.query} ${spec.product}`, allowed);
  const plan = await planFinderStores(wanted);
  const names = plan.search.map(finderStoreName);
  narrator.emit({ type: "step_started", step: "search", label: searchStartedLabel(names) });
  for (const store of plan.search) narrator.emit({ type: "store_search_started", store: { id: store, name: finderStoreName(store) } });
  await writer.save();

  const cataloguePromise = searchFinderCatalogue(spec.searchQuery);
  const searchPromises = new Map(
    plan.search.map((store) => [
      store,
      searchFinderStore(store, spec.searchQuery).then((result) => {
        spent.searches += store === "target" || store === "ebay" ? 0 : 1;
        narrator.emit({ type: "store_search_done", storeId: store, listings: result.listings.length });
        void writer.save();
        return result;
      }),
    ]),
  );
  // The fast answer runs beside the store searches and lands on screen as soon as it is ready:
  // what we had already priced, plus Target's own search when it answers in time.
  // Target only when it answers quickly: from our servers it can need the slower proxy, and the fast answer must stay fast.
  const targetRows = searchPromises.get("target")?.then((r) => r.listings) ?? Promise.resolve([] as FinderListing[]);
  const fastRows = Promise.all([cataloguePromise, withTimeout(targetRows, FINDER.quickPickTargetWaitMs, [] as FinderListing[])]).then(([cat, target]) => [
    ...cat,
    ...target,
  ]);
  quickPromise = findQuickPick(run, spec, allowed, fastRows, msLeft, usage).then((quick) => {
    if (quick) {
      narrator.emit({ type: "quick_pick", candidate: quickCandidate(quick), quote: quick.quote, priceContext: quick.priceContext, extractionCacheId: quick.cacheId, reason: quickPickReason(finderStoreName(quick.listing.store)) });
      void writer.save();
    }
    return quick;
  });
  const searches: StoreSearchResult[] = await Promise.all(searchPromises.values());
  const catalogue = (await cataloguePromise).filter((l) => allowed.has(l.store));
  const outcomes: StoreSearchOutcome[] = searches.map((s) => ({ name: finderStoreName(s.store), listings: s.listings.length, failed: s.failed }));
  const skipped = [
    ...plan.skipped.map((s) => ({ name: finderStoreName(s.store), reason: s.reason })),
    ...searches.filter((s) => s.failed).map((s) => ({ name: finderStoreName(s.store), reason: "failed" as const })),
  ];
  narrator.emit({ type: "step_done", step: "search", summary: searchSummary(outcomes, catalogue.length), details: searchDetails(catalogue.length, skipped) });
  await writer.save();

  const searchedNames = outcomes.filter((o) => !o.failed).map((o) => o.name);
  const unansweredNames = outcomes.filter((o) => o.failed).map((o) => o.name);
  // Every live store failed: say so, rather than "no new X" off the catalogue alone.
  const noMatch = (reason: "no_listings" | "no_exact") =>
    searchedNames.length === 0 && unansweredNames.length > 0
      ? nothingFoundMessage(spec.product, unansweredNames, "stores_unavailable")
      : nothingFoundMessage(spec.product, searchedNames, reason);
  const listings = mergeListings(searches.flatMap((s) => s.listings), catalogue, 200);
  if (listings.length === 0) return handoff(noMatch("no_listings"));

  // 3. Shortlist ──────────────────────────────────────────────────────────
  narrator.emit({ type: "step_started", step: "shortlist", label: "Keeping only exact matches" });
  await writer.save();

  const filtered = postFilterListings(listings, spec, allowed);
  const display = await loadDisplayPricingCalculator();
  const estimates = new Map<string, number | null>();
  // Sequential: the calculator loads its rate on first use (see catalog-search.service).
  for (const l of filtered.kept) estimates.set(l.id, await estimateLandedGhs(display, l, spec.category).catch(() => null));
  const overBudget = filtered.kept.filter((l) => isClearlyOverBudget(estimates.get(l.id) ?? null, spec.budgetGhs, FINDER.overBudgetMargin));
  const inBudget = filtered.kept.filter((l) => !overBudget.includes(l));
  const forModel = mergeListings(inBudget.filter((l) => l.source === "live"), inBudget.filter((l) => l.source === "catalogue"), FINDER.maxListingsForShortlist);

  const picked = forModel.length > 0 ? await withTimeout(shortlistListings(spec, forModel, usage), FINDER.shortlistTimeoutMs + 2_000, null) : null;
  const matches = picked?.matches ?? keywordMatches(spec, forModel);
  const modelDrops: Partial<Record<DropReason, number>> = picked?.dropped ?? { wrong_item: forModel.length - matches.length };
  const dropped = mergeDrops(filtered.dropped, overBudget.length ? { over_budget: overBudget.length } : {}, modelDrops, {
    wrong_item: Math.max(0, inBudget.length - forModel.length),
  });

  // Cheapest estimated landed first, the model's order breaking ties and unknowns.
  const order = new Map(matches.map((m, i) => [m.id, i]));
  const ranked = [...matches].sort((a, b) => {
    const ea = estimates.get(a.id) ?? Number.POSITIVE_INFINITY;
    const eb = estimates.get(b.id) ?? Number.POSITIVE_INFINITY;
    return ea === eb ? order.get(a.id)! - order.get(b.id)! : ea - eb;
  });
  const top = pickPriceCandidates(ranked, FINDER.priceCandidates);
  const announce = (list: readonly FinderListing[]) => {
    for (const l of list) {
      narrator.emit({
        type: "candidate_found",
        candidate: {
          id: l.id,
          title: l.title,
          store: { id: l.store, name: finderStoreName(l.store) },
          productUrl: l.productUrl,
          imageUrl: l.imageUrl,
          condition: "New",
          listingPriceUsd: l.priceUsd ?? 0,
          seller: l.seller,
        },
      });
    }
  };
  announce(top);
  narrator.emit({ type: "step_done", step: "shortlist", summary: shortlistSummary(matches.length, listings.length), details: dropDetails(dropped) });
  await writer.save();
  if (top.length === 0) return handoff(noMatch("no_exact"));

  // 4. Price at the store ─────────────────────────────────────────────────
  narrator.emit({ type: "step_started", step: "price", label: "Checking each price at the store" });
  for (const l of top) narrator.emit({ type: "price_check_started", candidateId: l.id });
  await writer.save();

  const readOne = async (l: FinderListing) => {
    try {
      const prepared = await prepareProductUrl(l.productUrl);
      // No viewer: the finder's candidates are not the customer's pastes.
      const read = extractPrepared(prepared, { userId: null, sessionId: null });
      const extraction = await withTimeout<FreshExtraction | null>(read, Math.max(5_000, msLeft() - 20_000), null);
      return extraction?.extraction_cache_id ? { listing: l, extraction, cacheId: extraction.extraction_cache_id } : { listing: l, extraction: null, cacheId: null };
    } catch (error) {
      logger.warn("finder: candidate extraction failed", { runId: run.id, url: l.productUrl, error: error instanceof Error ? error.message : String(error) });
      return { listing: l, extraction: null, cacheId: null };
    }
  };
  const extractions = await Promise.all(top.map(readOne));
  // A page we could not read is not an answer: read the next matches in its place while there is time.
  const readCount = () => extractions.filter((e) => e.extraction?.product.price != null).length;
  let next = ranked.filter((l) => !top.includes(l));
  while (readCount() < FINDER.priceCandidates && next.length > 0 && msLeft() > FINDER.extraReadMinMs) {
    const more = next.slice(0, FINDER.priceCandidates - readCount());
    next = next.slice(more.length);
    announce(more);
    for (const l of more) narrator.emit({ type: "price_check_started", candidateId: l.id });
    await writer.save();
    extractions.push(...(await Promise.all(more.map(readOne))));
  }
  const checks = await checksByExtraction(extractions.flatMap((e) => (e.cacheId ? [e.cacheId] : [])));
  const priceHolds = new Map(
    extractions.map((e) => [e.listing.id, e.extraction && e.cacheId ? priceHold(e.extraction, checks.get(e.cacheId) ?? []) : null]),
  );
  const readable = extractions.filter((e) => e.extraction != null && e.extraction.product.price != null);
  const confirmed = readable.filter((e) => priceHolds.get(e.listing.id)?.kind !== "price_check");
  for (const e of readable) if (priceHolds.get(e.listing.id)?.kind === "price_check") narrator.emit({ type: "price_confirming", candidateId: e.listing.id });
  narrator.emit({ type: "step_done", step: "price", summary: priceSummary(confirmed.length, extractions.length, extractions.length - readable.length) });
  await writer.save();
  if (readable.length === 0) return handoff(nothingFoundMessage(spec.product, searchedNames, "no_price"));

  // 5. Freight and the landed total ───────────────────────────────────────
  narrator.emit({ type: "step_started", step: "freight", label: "Working out freight to Accra" });
  await writer.save();
  const calculator = await loadPricingCalculator();
  // The typical price of the exact matches: a new item far below it is checked, not crowned.
  const reference = outlierReference(matches.map((m) => m.priceUsd ?? 0));
  const priced: PricedCandidate[] = [];
  const qualityDrops: string[] = [];
  const settled = await Promise.all(readable.map(async (e) => ({ e, result: await settleFreight(e.extraction!, e.cacheId!, msLeft()) })));
  for (const { e, result } of settled) {
    const l = e.listing;
    const snapshot = result ?? e.extraction!;
    // The store page has the last word on condition: a "new" search row can read as a refurbished offer.
    const readTitle = snapshot.product.title ?? l.title;
    if (isNotNew({ title: readTitle, condition: snapshot.product.condition ?? null }) || isRiskyListing(readTitle)) {
      priced.push({ listing: l, cacheId: e.cacheId, quote: null, state: "dropped" });
      qualityDrops.push(`${finderStoreName(l.store)}: ${isRiskyListing(readTitle) ? "the listing warns of damage or missing parts" : `sold as ${snapshot.product.condition ?? "not new"}`}`);
      narrator.emit({ type: "price_confirming", candidateId: l.id });
      continue;
    }
    const { pricing } = await priceExtractionWith(calculator, snapshot, 1, null, null);
    const hold = payHoldOf({ extraction: snapshot, checks: checks.get(e.cacheId!) ?? [] });
    if (hold?.kind === "unavailable" || !isPayablePricing(pricing)) {
      priced.push({ listing: l, cacheId: e.cacheId, quote: null, state: "dropped" });
      narrator.emit({ type: "price_confirming", candidateId: l.id });
      continue;
    }
    const quote = toFinderQuote(pricing);
    if (hold?.kind === "price_check" || hold?.kind === "freight_check") {
      priced.push({ listing: l, cacheId: e.cacheId, quote, state: "confirming" });
      narrator.emit({ type: "price_confirming", candidateId: l.id });
      continue;
    }
    const judged = l.priceUsd ?? (snapshot.product.currency === "USD" ? snapshot.product.price : null);
    // Far below other new listings: shown but never picked as best. It no longer holds payment.
    const stockCheck = isSuspiciouslyLow(judged, reference);
    priced.push({ listing: l, cacheId: e.cacheId, quote, state: stockCheck ? "stock_check" : "priced" });
    narrator.emit({ type: "candidate_priced", candidateId: l.id, quote, priceContext: priceContextOf(snapshot), stockCheck, extractionCacheId: e.cacheId! });
  }
  const shown = priced.filter((p) => p.state !== "dropped");
  const quick = await settledQuick();
  if (quick && !shown.some((p) => p.cacheId === quick.cacheId || p.listing.productUrl === quick.listing.productUrl)) {
    const c = quickCandidate(quick);
    narrator.emit({ type: "candidate_found", candidate: c });
    narrator.emit({ type: "candidate_priced", candidateId: c.id, quote: quick.quote, priceContext: quick.priceContext, stockCheck: false, extractionCacheId: quick.cacheId });
    shown.push({ listing: quick.listing, cacheId: quick.cacheId, quote: quick.quote, state: "priced" });
  }
  const freights = shown.filter((p) => p.state !== "confirming" && p.quote).map((p) => p.quote!.rows.find((r) => r.key === "freight")?.amountGhs ?? 0);
  narrator.emit({ type: "step_done", step: "freight", summary: freightSummary(freights), details: qualityDrops.map((d) => `Set aside after reading the page: ${d}`) });
  await writer.save();
  if (shown.length === 0) return handoff(nothingFoundMessage(spec.product, searchedNames, "no_price"));

  // 6. Compare ────────────────────────────────────────────────────────────
  narrator.emit({ type: "step_started", step: "compare", label: "Comparing landed totals" });
  const rankInput: RankInput[] = shown.map((p) => ({
    id: p.listing.id,
    title: p.listing.title,
    storeName: finderStoreName(p.listing.store),
    state: p.state as RankInput["state"],
    quote: p.state === "confirming" ? null : p.quote,
  }));
  const ranking = rankCandidates(rankInput, spec.budgetGhs);
  const fullyPriced = rankInput.filter((c) => c.state === "priced" && c.quote);
  const within = spec.budgetGhs == null ? null : fullyPriced.filter((c) => c.quote!.totalGhs <= spec.budgetGhs!).length;
  narrator.emit({ type: "step_done", step: "compare", summary: compareSummary(fullyPriced.length, within) });
  const ids = ranking.bestId ? [ranking.bestId, ...ranking.alternativeIds] : ranking.alternativeIds;
  // Options far apart in price are different specs: say which, so the dear one does not read as a mistake.
  const spread = wideSpread(rankInput.filter((c) => c.quote).map((c) => ({ title: c.title, store: c.storeName, totalGhs: c.quote!.totalGhs })));
  const specNote = spread ? await explainSpecSpread(spec.product, spread, Math.min(FINDER.specNoteTimeoutMs, msLeft() - 5_000), usage) : null;
  narrator.emit({ type: "result_ready", bestId: ids[0]!, alternativeIds: ids.slice(1), why: ranking.why, ...(specNote ? { specNote } : {}) });

  return {
    status: "done",
    result: {
      bestId: ranking.bestId,
      alternativeIds: ranking.alternativeIds,
      candidates: shown.map((p) => ({ id: p.listing.id, store: p.listing.store, extractionCacheId: p.cacheId, state: p.state, totalGhs: p.quote?.totalGhs ?? null })),
      tokens: usage,
    },
  };
}

export type FinderJobOutcome = "done" | "no_match" | "failed" | "requeued" | "skipped";

/**
 * Run one finder job to its end. Never throws at the caller (the route's
 * `after()` or the sweep). A missing table is the exception: a deploy ahead of
 * its migration must be loud.
 */
export async function runFinderJob(runId: string): Promise<FinderJobOutcome> {
  const row = await getFinderRunById(runId);
  if (!row || row.status !== "pending") return "skipped";
  const startEvent: FinderEvent = { type: "run_started", at: 0, query: row.query, budgetGhs: row.budget_ghs };
  const claimed = await claimFinderRun(runId, [startEvent]);
  if (!claimed) return "skipped";

  const startedAt = Date.now();
  const attempts = claimed.attempts + 1;
  const narrator = new FinderNarrator(startedAt, Date.now, [startEvent]);
  const spent = { searches: claimed.vendor_searches };
  const usage: TokenUsage = { input: 0, output: 0 };
  const writer = new ProgressWriter(runId, narrator, () => spent.searches);

  let settled: FinderRunRow | null = null;
  let outcome: FinderJobOutcome;
  try {
    const result = await runPipeline(claimed, narrator, writer, spent, usage, startedAt);
    await writer.flush();
    settled = await completeFinderRun({ id: runId, status: result.status, events: narrator.events, result: result.result, attempts, vendorSearches: spent.searches });
    outcome = result.status;
    logger.info("finder: run settled", { runId, status: result.status, ms: Date.now() - startedAt, searches: spent.searches, tokens: usage });
  } catch (error) {
    await writer.flush().catch(() => undefined);
    if (isSchemaMissingError(error)) throw error;
    const message = error instanceof Error ? error.message : String(error);
    logger.error("finder: run failed", { runId, attempts, error: message });
    if (attempts >= FINDER.maxAttempts) {
      narrator.emit({ type: "nothing_found", message: nothingFoundMessage(null, [], "failed"), whatsappText: buyerHandoffText(claimed.query, claimed.budget_ghs, runId) });
      settled = await completeFinderRun({ id: runId, status: "failed", events: narrator.events, result: null, attempts, vendorSearches: spent.searches, error: message.slice(0, 500) }).catch(() => null);
      outcome = "failed";
    } else {
      await requeueFinderRun(runId, attempts, message);
      outcome = "requeued";
    }
  }

  // Outside the try: a message we could not send must never undo the run (see extraction-queue.service).
  if (settled) await sendFinderEmail(settled).catch(() => undefined);
  return outcome;
}

export interface FinderSweepSummary {
  reclaimed: number;
  ran: number;
  outcomes: FinderJobOutcome[];
}

/**
 * The safety net: release runs whose worker died, then run up to `batch`
 * that nothing started. Each run is bounded by `FINDER.deadlineMs` (210 s), so
 * one fits inside the route's 300 s; the sweep runs every minute.
 */
export async function sweepFinderRuns(batch = 1): Promise<FinderSweepSummary> {
  const { touched: reclaimed, failed } = await reclaimStaleFinderRuns(FINDER.staleRunningMs, FINDER.maxAttempts, (run) => ({
    type: "nothing_found",
    at: Math.max(0, Date.now() - Date.parse(run.started_at ?? run.created_at)),
    message: nothingFoundMessage(null, [], "failed"),
    whatsappText: buyerHandoffText(run.query, run.budget_ghs, run.id),
  }));
  for (const run of failed) await sendFinderEmail(run).catch(() => undefined);
  const queued = await listStalePendingFinderRuns(FINDER.stalePendingMs, batch);
  const outcomes: FinderJobOutcome[] = [];
  for (const run of queued) outcomes.push(await runFinderJob(run.id));
  return { reclaimed, ran: outcomes.filter((o) => o !== "skipped").length, outcomes };
}

