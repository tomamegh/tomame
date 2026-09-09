# Extraction & Pricing Pipeline — Rework Proposal

> **Purpose.** This document is the brief for a *new session* to rebuild Tomame's
> product extraction and pricing pipeline. It is self-contained: read it top to
> bottom and you have the insights, the target architecture, the interfaces, and
> a phased build order mapped to real files. It is **not** a clone of any
> competitor — it borrows resilience patterns and rejects the parts that don't
> fit Tomame's concierge, multi-region, admin-reviewed model.
>
> Authored 2026-09-09 from (a) a competitive teardown of wolevo.com's public
> quote flow and one authenticated catalogue endpoint, and (b) a read of the
> current pipeline in this repo.

---

## Decision & status (2026-09-09) — IMPLEMENTED

The rework below was reviewed and built in one pass, with these changes to the
proposal:

| Proposal said | What was built | Why |
|---|---|---|
| Apify first, then Browserless+Cheerio, then LLM | **Direct fetch → Browserless** for HTML, then **platform Cheerio → generic JSON-LD/OpenGraph → Claude → Apify (optional)** | Apify is the slowest and least stable tier (unpinned community actors, 10–100 s). It is now last-resort and skipped without a token. The generic structured-data parser is new: it reads any store that publishes schema.org data, so adding a store is a domain→region mapping, not a scraper. |
| Signed `quoteId` re-verified at payment | **Server-owned snapshot**: `extraction_cache` row (product-keyed) is the quote; `createOrder` ignores every client money field and re-prices from the row; payment already charges the stored order pricing | Same guarantee, no HMAC to manage. The actual hole was `createOrder` trusting `input.pricing` from the browser — closed in `order-intake.service.ts`. |
| Not covered | **Multi-currency**: GBP/CNY listings are converted to USD via stored cross rates before pricing | Previously a £100 item was priced as $100. |
| Add min-chargeable-weight constant | Added (`minimum_chargeable_weight_lbs`) + `fixed_freight_items` finally wired into the calculator (`fixed_freight` method) | Both tables were seeded and unused. |
| Move to `jobs` table for long extractions | **Deferred.** Chain has a 90 s budget with per-tier deadlines; route `maxDuration` 120 s | Direct fetch + Browserless + Claude typically finish in <40 s. Revisit if p95 says otherwise. |
| kg vs lb | **lb everywhere**, converted at the edge (`weight_lbs` on the product) | Matches `pricing_groups.default_weight_lbs` and the formula `w`. |

**Live verification (2026-09-09, real keys):** Amazon 14 s (datacenter Browserless; Claude filled the weight),
eBay 24 s and SHEIN 27 s (both need Browserless **residential proxy** — datacenter IPs get an error page /
empty shell; billed per GB). Micro Center did not clear Cloudflare within the 120 s plan maximum on any
path → falls to manual entry. The Apify eBay actor requires a paid rental; the SHEIN actor timed out at 90 s.

**Speed (2026-09-09 tuning):** the quote responds as soon as title + price + currency are known (fast mode);
the Claude weight lookup runs after the response via `after()` and updates the cache row. Per-store HTML attempt
order skips paths known to fail. Measured: Amazon 10–15 s, eBay ~18 s, SHEIN ~18 s, repeat pastes instant (cache).
Sub-second like Wolevo needs a product data API (e.g. Rainforest/Keepa for Amazon) as a tier ahead of the browser.

**Keys to create:** `BROWSERLESS_API_KEY`, `ANTHROPIC_API_KEY`, `EXCHANGE_RATE_API_KEY` (required).
`APIFY_API_TOKEN`, `FREECURRENCY_API_KEY` optional. `SERPAPI_API_KEY` and ScrapingBee removed.

**Where the code lives:** `src/features/extraction/{url.ts, extraction.service.ts, quote.service.ts, resolvers/*}`,
`src/features/orders/services/order-intake.service.ts`, `src/lib/pricing/calculator.ts`,
`supabase/migrations/035_extraction_cache_product_keyed.sql`.

---

## 0. TL;DR for the next session

Build a **resolver chain behind one quote endpoint**:

1. Ordered providers (catalogue/cache → Apify → Browserless+Cheerio → LLM), each
   returning a *partial* product, merged field-by-field, **never throwing**.
2. A **pure pricing function** that runs identically at quote time and again at
   payment time.
3. A single response that carries product + price together, plus a **signed
   `quoteId`** the server re-verifies before charging.

Do it in six phases (§6). Each phase ships customer-visible value and is an
approval gate per `CLAUDE.md`'s one-feature-at-a-time rule. **Settle the two
blockers in §7 before writing code.**

---

## 1. What the current pipeline does (as-is)

Read these before changing anything:

- `src/features/extraction/extraction.service.ts` — orchestrator: URL
  normalization, short-URL resolution, `(user_id, url_hash)` cache, in-flight
  coalescing, country mapping, then calls one scraper and returns.
- `src/features/extraction/scrapers/{amazon,ebay,shein,microcenter}.ts` — one
  class per platform, each exposing `scrape(url)` (fetch) and `extract($)`
  (Cheerio parse).
- `src/features/extraction/scrapers/registry.ts` — platform → scraper mapping.
- `src/lib/apify/client.ts` — per-platform Apify actor calls.
- `src/lib/browserless/client.ts` — headless Chrome: `/chromium/unblock`,
  `/function` (image via browser session), `/content?stealth`.
- `src/lib/scrapingbee/client.ts` — imported by `shein.ts`, **never called**.
- `src/lib/exchange-rates/{service,exchange-rate-api,freecurrency}.ts` — currency.
- `src/app/api/products/extract/route.ts` — the HTTP entry (`maxDuration = 240`).
- `src/app/api/cron/exchange-rates/route.ts` — 4-hourly rate refresh (pg_cron).

### Findings from that read (why we are reworking)

| # | Finding | Severity |
|---|---------|----------|
| 1 | Amazon/eBay/SHEIN each run **one Apify actor and `throw` on null** — a single point of failure for 75% of the catalogue. | High |
| 2 | ~1,080 lines of Cheerio selectors (`extract($)`) are reachable **only from tests**; production goes through `mapApifyToScrapedProduct`, which has **no tests**. | High |
| 3 | Four **community Apify actors, none version-pinned** — an author's update changes output shape underneath us. | High |
| 4 | Cache keyed on `(user_id, url_hash)` — ten customers pasting the same item pay for **ten actor runs**. | Medium |
| 5 | Route comment justifying `maxDuration = 240` describes ScrapingBee-before-Apify; **ScrapingBee is never called** and Apify is first. | Medium |
| 6 | `SERPAPI_API_KEY` is **required by Terraform, read by no code**. It was meant for weight lookup — which drives shipping on every quote. | Medium |
| 7 | One 30-min TTL for fields that change at wildly different rates (price vs. weight/dimensions). | Low |

### Keys, current state (both environments)

- **Placeholders (`DUMMY-not-a-real-key`)**: `APIFY_API_TOKEN`,
  `BROWSERLESS_API_KEY`, `SERPAPI_API_KEY`, `FREECURRENCY_API_KEY`,
  `EXCHANGE_RATE_API_KEY`. **Nothing extracts or prices until these are real.**
- Currency: `EXCHANGE_RATE_API_KEY` (exchangerate-api.com) is the one the cron
  actually uses; `FREECURRENCY_API_KEY` (freecurrencyapi.com) is configured but
  **not wired as a fallback**.

---

## 2. Insights from the competitive teardown (Wolevo)

Observed by driving wolevo.com's public shipping calculator and reading the
network timeline. **Do not copy their product — copy the patterns that apply.**

**Their public quote endpoint:**

```
POST https://api.wolevo.com/api/v1/public/shipping-estimate/product
{ "retailer": "AMAZON", "productIdentifier": "<url>", "destinationCountryCode": "GH" }
```

**Success (~530ms):**

```json
{
  "shippingFeeUsd": 20,
  "shippingFeeLocal": 250.97,
  "destinationCurrency": "GHS",
  "exchangeRate": 12.5484,
  "route": "US-GH",
  "feeCalculationNote": "0.6kg",
  "productTitle": "The Anxious Generation...",
  "productPrice": 16.8,
  "productCurrency": "USD",
  "productImageUrl": "https://m.media-amazon.com/images/I/81Rz9l29NiL.jpg",
  "retailer": "AMAZON",
  "productType": "OTHER",
  "usedFixedPricing": false,
  "minimumChargeableApplied": true,
  "messages": []
}
```

**Extraction failed — still `200`, product fields simply absent:**

```json
{
  "destinationCurrency": "GHS", "exchangeRate": 12.5484, "route": "US-GH",
  "productType": "OTHER", "usedFixedPricing": false, "minimumChargeableApplied": false,
  "messages": ["Weight not provided by retailer — calculated when we receive your item"]
}
```

Other observations:
- Bad URL → `400 Invalid product URL` **before any spend**.
- Public rate limit: **5 requests / 10 min / IP** with `retryAfter`.
- `productType` is a rich enum (`TABLET_COMPUTER`, `CELLULAR_PHONE`,
  `NOTEBOOK_COMPUTER`, `HEADPHONES`, `TELEVISION`, `OTHER`, …) that drives
  pricing and the `usedFixedPricing` flag.
- Their `homepage-deals` endpoint returns a **curated catalogue** with embedded
  exchange rates — i.e. their sub-second quotes read from a product data source,
  **not** a page render.
- Images are raw retailer-CDN URLs handed straight to the browser — **no proxy**.
- Backend tells: Spring Boot error shape, `railway-hikari` server header → Java on
  Railway. (Informational only.)

### Five patterns worth borrowing

1. **Degrade, never fail.** A valid link always yields a usable result; missing
   weight becomes a message, not an error. Order can still proceed.
2. **One quote, all of it.** Product + freight + rate + calculation note in a
   single response.
3. **Type drives price.** A `productType` classification selects fixed vs.
   weight-based pricing.
4. **Weight is the axis.** Freight = weight × rate, with a **minimum chargeable
   weight** floor.
5. **Cheap before costly.** Validate URLs, cache hard, rate-limit — all before
   spending on extraction.

---

## 3. Target architecture

Replace the four bespoke scrapers-that-throw with a single **resolver chain**
feeding a **pure pricing function**, behind **one quote endpoint**.

```
pasted link + region
      │
      ▼
  validate URL ──(malformed)──▶ 400, no spend
      │
      ▼
┌─────────────────────────────────────────────┐
│ RESOLVER CHAIN  (merge fields, never throw)  │
│   0 · catalogue / cache   (product-keyed)    │
│   1 · Apify actor         (pinned version)   │
│   2 · Browserless + Cheerio (the 1,080 lines)│
│   3 · LLM extraction      (HTML → JSON schema)│
│   ───────────────────────────────────────    │
│   → merged partial product (best confidence) │
└─────────────────────────────────────────────┘
      │
      ▼
  pricing()  ── pure, server-only ──▶ weight×rate + min floor,
      │                               type → fixed/%, × exchange rate
      ▼
   Quote { product, pricing, messages[], signed quoteId }
      │
      ▼
  (at payment) server recomputes from snapshot + current pricing_config,
               rejects on drift  ← the trust boundary
```

- Providers run **cheapest → costliest**; the chain **stops** once required
  fields (title, price, and weight-or-deferral) are filled.
- Each provider contributes what it can; the **merge** keeps the highest-
  confidence value per field. One flaky source never takes extraction down.
- Pricing is a **pure function** so it runs identically at quote time and again
  at payment time.

---

## 4. The two interfaces to write first

Everything hangs off these. Define them before touching any provider.

```ts
// 1. The resolver — every source implements this. None of them throw.
interface ExtractionResolver {
  name: "catalogue" | "apify" | "browserless" | "llm";
  supports(platform: Platform): boolean;
  // returns whatever it could find; null fields are "didn't know", not "failed"
  resolve(input: ResolveInput): Promise<
    Partial<ScrapedProduct> & { _confidence?: Record<string, number> }
  >;
}

// The chain runs resolvers in order, merges best-confidence field values,
// and stops once required fields (title, price, weight-or-deferral) are filled.
async function resolveProduct(
  url: string, platform: Platform, region: Region
): Promise<ExtractionOutcome>;

// 2. The quote — one response shape, product and price together.
//    Modelled on Wolevo's response; adds the parts they don't have.
interface Quote {
  product: {
    title: string | null;
    price: number | null;
    currency: string | null;
    imageUrl: string | null;
    brand: string | null;
    productType: string;        // enum; drives pricing (see §5)
    condition: string | null;
    weightKg: number | null;    // null → deferral message
  };
  pricing: {
    itemPriceUsd: number;
    shippingFeeUsd: number;
    serviceFeeUsd: number;
    exchangeRate: number;
    totalLocal: number;
    destinationCurrency: string;
    feeCalculationNote: string;         // "0.6kg", "fixed", etc. — show the work
    usedFixedPricing: boolean;
    minimumChargeableApplied: boolean;
  };
  extraction: {
    success: boolean;
    source: ExtractionResolver["name"];
    cached: boolean;
  };
  messages: string[];           // "Weight calculated at intake", etc.
  quoteId: string;              // signed; server recomputes & compares at payment
  quoteExpiresAt: string;       // ISO
}
```

### The trust boundary (non-negotiable, per CLAUDE.md)

`CLAUDE.md`: *never trust a client-provided total.* A cached quote endpoint is
exactly where a stale or tampered price becomes a loss. So `quoteId` is **not
decoration**: at payment the server **recomputes pricing from the stored product
snapshot and the current `pricing_config`** and rejects if it drifts beyond
tolerance. The codebase already voids with `order_repriced`
(`src/features/orders/services/orders.review.service.ts`) — this makes that a
designed gate, not an exception path.

---

## 5. Existing schema the pipeline should USE (already migrated, do not rebuild)

The database is ahead of the pipeline. These tables exist and are seeded:

- **`pricing_groups`** (migration 028/030/032) — the pricing engine, already
  models weight:
  - `flat_rate_ghs` — fixed GHS shipping (NULL if weight-based)
  - `flat_rate_expression` — weight formula, e.g. `"5 + (w / 8)"` (NULL if flat)
  - `value_percentage`, `value_percentage_high`, `value_threshold_usd` — tiered
    service fee
  - `default_weight_lbs` — fallback weight when unavailable
  - `requires_weight` — reject order if weight unavailable
  - **Note: this column is `lbs`.** Wolevo quotes `kg`. **Pick one unit and
    convert at the edge — do not mix.**
- **`fixed_freight_items`** (migration 014/015) — pre-negotiated freight for
  recognized products, matched by `keywords[]` / `category`. This is the
  `usedFixedPricing` path.
- **`category_pricing_map`** (migration 029) — category → pricing group.
- **`pricing_constants`** (migration 016/027) — scalar knobs (add a
  minimum-chargeable-weight constant here).
- **`exchange_rates`** (migration 012) — refreshed by pg_cron (026, and the
  vault settings in 034).

Pricing formula (from `CLAUDE.md`):
`total_ghs = (item_price_usd + shipping_fee_usd + item_price_usd × service_fee_pct) × exchange_rate`

---

## 6. Where Tomame deliberately diverges from Wolevo

| Dimension | Wolevo | Tomame — the better fit |
|-----------|--------|-------------------------|
| Human in the loop | Fully automated | **Keep admin review.** Auto-quote is a *draft*; admin `set_price` before the customer pays. Extraction feeds the admin, doesn't replace them. This is Tomame's trust advantage. |
| Regions | US → GH/NG only | **USA / UK / CHINA.** Resolver + pricing region-aware from day one (`amazon.co.uk`, SHEIN/AliExpress CN). No single-route shortcut. |
| Failure recovery | Message, then manual intake | **LLM tier before giving up** — reads rendered HTML against a schema; also the durable answer to the weight gap ("Item Weight: 1.2 lb" from any spec table). |
| Long extractions | Fast source, no jobs | **Move to the `jobs` table** (`agent.md` specs it, never migrated). Paste → enqueue → poll kills the 240s ceiling and survives a timeout. |

---

## 7. BLOCKERS — settle before writing code

### 7.1 Scope contradiction (blocks the next session)

`CLAUDE.md` lists **"automated product price scraping"** and **"volumetric weight
calculations"** as *out of scope for MVP Phase 1*, and mandates
one-feature-at-a-time with approval gates. But the repo already ships a
four-retailer scraping pipeline. The next agent will get contradictory
instructions from the docs and the code.

**Action:** decide which is authoritative and update the other. Recommended: move
scraping into Phase 1 in `FEATURES.md` and note it in `CLAUDE.md`, since the code
has already committed.

### 7.2 Keys

- Make the four real: `APIFY_API_TOKEN`, `BROWSERLESS_API_KEY`,
  `EXCHANGE_RATE_API_KEY`, `FREECURRENCY_API_KEY`. Set them per-environment via
  `TF_VAR_third_party_secrets` at apply time (they live in Vercel env vars;
  changes require a redeploy). **Do not put per-env secrets in
  `infra/secrets.auto.tfvars` — it outranks `TF_VAR_*` and silently overrides.**
- `SERPAPI_API_KEY`: required by Terraform, read by no code. Either remove it from
  the `third_party_secrets` validation in `infra/variables.tf`, or repurpose the
  budget toward the LLM tier (which does the weight-lookup job it was meant for).
- Phase 5 adds an **LLM provider key**.

---

## 8. Phased build order (each phase = one approval gate)

Ordered so each phase ships customer-visible value and nothing depends on a later
phase.

### Phase 1 — Contracts + degrade-never  → *ships: no more 502s*
Write the `ExtractionResolver` and `Quote` interfaces. Wrap today's four scrapers
as resolvers unchanged. Replace every `throw` in `scrape()` and the
`APIError(502)` in the service with a partial + `messages[]`. Nothing new
extracted yet — but a valid link stops failing.
- Files: `src/features/extraction/{resolver.ts, quote.ts, extraction.service.ts}`,
  `scrapers/*.ts`

### Phase 2 — Quote endpoint + pricing function  → *ships: price with product*
Have `/api/products/extract` return a full `Quote`. Extract a pure `pricing()`
from the review service so it runs at quote time too. Wire `pricing_groups`,
`fixed_freight_items`, `pricing_constants`, `exchange_rates`.
- Files: `src/app/api/products/extract/route.ts`,
  `src/features/orders/services/pricing.ts` (new, pure — no HTTP objects)

### Phase 3 — Weight + type as real fields  → *ships: accurate freight*
Map actor payloads into `weightKg` and `productType`. Feed
`flat_rate_expression` / `default_weight_lbs` / minimum chargeable weight. Fixed
pricing by type via `fixed_freight_items` + `category_pricing_map`. **Settle
lb-vs-kg once, convert at the edge.**
- Files: `src/lib/apify/client.ts` (mappers), `pricing.ts`, new migration for a
  minimum-chargeable-weight constant

### Phase 4 — Cheap-before-costly  → *ships: lower bills*
Per-retailer URL validation → 400 before any actor call. Re-key
`extraction_cache` on `url_hash` alone; split TTL (price minutes, static fields
days). Tighten `RATE_LIMIT.extraction` (currently 15/15min). Images: direct CDN
by default (`next.config.ts` already allows `hostname: "**"`), proxy only an
allowlist (currently just `productimages.microcenter.com`).
- Files: `src/config/security.ts`, `extraction.service.ts` (cache key),
  `scrapers/resolve-platform.ts`, `src/app/api/img-proxy/route.ts`

### Phase 5 — Resilience tiers  → *where we pass Wolevo*
Wire the existing `extract($)` Cheerio parsers as tier 2 behind Browserless for
Amazon/eBay/SHEIN. Add the LLM tier 3 against a strict JSON schema. Pin every
Apify actor to `actor:version`. Add a daily canary cron that scrapes one known
product per platform and alerts on null title/price.
- Files: `scrapers/*.ts` (tier wiring), `src/lib/llm-extract/` (new), a canary
  cron route

### Phase 6 — Signed quote + jobs  → *the trust boundary*
Persist quotes; sign `quoteId`; recompute-and-compare at payment, void on drift.
Move extraction onto the `jobs` table from `agent.md` (paste → enqueue → poll) to
escape the 240s ceiling. Currency: make `FREECURRENCY_API_KEY` a real fallback
behind `EXCHANGE_RATE_API_KEY` in the cron.
- Files: new migration (quotes + jobs), `orders.service.ts` (re-verify),
  `src/lib/exchange-rates/service.ts`

---

## 9. Architecture rules to honor (from CLAUDE.md)

- **Layering**: `app/api/**` = HTTP orchestration only; business logic in
  `services/**` (no HTTP objects); DB access in `db/queries/**` (no business
  logic). The pure `pricing()` function belongs in a service, not a route.
- **Server-only** money math and Paystack verification. Never trust a
  client-provided price or total.
- **RLS on every table.** New `quotes`/`jobs` tables need policies.
- **Audit** all mutations to order/payment/job state into `audit_logs`
  (append-only).
- **State machine** transitions server-side, validated, idempotent.

---

## 10. Not yet captured

Wolevo's **authenticated checkout** — the full breakdown with service fee and
duties, and whether they re-verify the quote server-side at payment — was not
observed (`/shop` requires login). It mainly confirms Phase 6; it does **not**
block Phases 1–5. If wanted, it can be captured by driving the logged-in flow in
a browser, without probing their API.

---

## Appendix — companion artifacts (visual versions of this analysis)

These were produced alongside this doc and say the same things with diagrams:
- Extraction pipeline review (current state + findings)
- Wolevo quote teardown (captured contract + side-by-side)
- This rework proposal

(They live as Claude artifacts; this Markdown file is the authoritative in-repo
source of truth for the next session.)
