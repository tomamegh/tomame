# Extraction: fast + many stores — plan (2026-09-12)

## Status — steps 1–4 built 2026-09-12 (same day)

Built in one pass after Kelvin supplied Oxylabs + Zyte credentials. What landed, and where it
differs from the plan below:

| Plan | Built |
|---|---|
| `stores` DB table | **Code registry** `src/features/extraction/stores.ts` — a store is domains + region + currency + provider plan + status. Marketing reads `SUPPORTED_STORE_NAMES` (live stores) from it. Adding a store is one entry; no migration. A table can wrap it later if admins need to edit stores. |
| Oxylabs for "headline stores" | Only **Amazon** (second source, carries item weight) and **Walmart** parse reliably. Best Buy, Target, eBay, AliExpress parsers all returned 12003 or rate limits live — not wired. |
| Zyte for the long tail | Wired as `zyte` resolver (HTTP source) for every store, plus `zyte-browser` HTML source. Reads Amazon, Walmart, Etsy, Nike, SHEIN; **Target, Best Buy, Home Depot, AliExpress, Temu are banned/empty** on Zyte too → registry marks them `blocked`, quote degrades to manual price entry with a clear message. |
| Parallel race | `resolvers/chain.ts` — ordered start with per-tier policy: `startAfterMs` (hedge), `startWhen` (precondition), or sequential. Losers aborted via `AbortSignal`. Budget 25 s, route `maxDuration` 60. |
| `store_category_map` + Haiku | Migration `043_store_category_map.sql`, `category.service.ts`, `category-map` resolver. Static maps → learned map → `claude-haiku-4-5`, written back. Starts the instant title+price land, overlapping the vendors. Opus stays only on the full-page fallback tier. |
| Browserless out | Still present as the HTML source for eBay/SHEIN residential paths (Zyte browser was slower there). Default HTML order is now direct → zyte-browser → Browserless. Apify removed from every plan. |
| Bench | `scripts/extraction-bench.ts` against the dev server. |

Unknown hosts are accepted (`generic` store, region null → customer confirms, Zyte reads the page);
private/IP hosts are rejected and the generic path never fetches from our own servers (public
endpoint → no SSRF).

Keys: `OXYLABS_USERNAME`, `OXYLABS_PASSWORD`, `ZYTE_API_KEY` — optional in `env.ts`, allow-listed
in `infra/variables.tf`, set in `.env.local`. **Still to do:** set them on both Vercel projects and
apply migration 043 to tomame-dev / tomame-prod (Management API, as for 035).

---


Brief for the session that implements this. Read `docs/extraction-pipeline-rework.md`
"Decision & status" first; this builds on that chain, it does not replace it.

## Where the time goes today

Measured/observed in the current code (`src/features/extraction/`):

| Step | Today | Why |
|---|---|---|
| ScraperAPI structured (Amazon/eBay) | 2–7 s | fine, but the only fast path, and only 2 stores |
| Category when the store record has none (eBay always) | +5–15 s | `EXTRACTION.llmModel = "claude-opus-5"` classifies from text; Opus is the slowest model for a 60-way enum |
| Any other store | 15–30 s | direct fetch 12 s timeout → Browserless 35 s timeout, **sequential**; SHEIN/eBay go straight to residential Chrome |
| Everything | strictly sequential | tier N+1 starts only after tier N finishes/fails; a dead direct fetch burns its full timeout before Chrome starts |
| Unknown stores | 400 | `registry.ts` lists 4 platforms; `url.ts` knows 16 domains but the route rejects anything without a scraper |

Target: **≤ 3 s p50 / ≤ 8 s p95 to a priced quote** for the top stores, any store with a
product page returning something usable, never a 400 for a real product URL.

## Decisions

### 1. Vendor: one multi-store structured API for the headline stores

Options checked 2026-09-12:

| Vendor | Structured product output for | Notes |
|---|---|---|
| **ScraperAPI** (have key) | Amazon, eBay, Walmart, Google Shopping only | Walmart endpoint sample lacks price/weight/category. Premium proxies not on plan |
| **Oxylabs Web Scraper API** | Amazon, Walmart, eBay, Target, Best Buy, Etsy, AliExpress, Alibaba, Costco, Lowe's, Staples, TikTok Shop, Temu (+~20 regional) with `parse=true`; any URL without parse | Realtime endpoint, geo_location, Micro plan $49/mo ≈ $0.50–1/1k. Best fit for "lots of shops" |
| **Zyte API** | `product` AI extraction on **any** URL (name, price, currency, brand, breadcrumbs, images, gtin/sku, additionalProperties, variants). No weight field | httpResponseBody tier ~0.7 s avg, browser tier a few s. Pay per success. Best fit for the long tail |
| **Bright Data Web Scraper API** | 600+ pre-built incl. Shein, Temu, Target, Best Buy | Async/batch shaped (trigger → poll), tens of seconds; skip for realtime quotes |
| **Decodo** | Amazon, Walmart, Target, Best Buy, Shein templates | Comparable to Oxylabs, smaller catalogue |

**Pick: Oxylabs (headline stores, parsed) + Zyte (`product` on any other URL) → replaces Browserless for HTML.**
Keep ScraperAPI as the second Amazon/eBay source (already paid, already wired). Browserless stays only
for image proxying (`fetchImageViaBrowser`); drop it from the HTML path once Zyte is live. Apify: delete.

Both are optional env keys like the others: `OXYLABS_USERNAME`/`OXYLABS_PASSWORD`, `ZYTE_API_KEY`.

### 2. Run tiers as a race, not a ladder

Replace the sequential loop in `resolvers/chain.ts` with **hedged parallel fan-out**:

- t=0: fire every *structured* provider available for the store at once (Oxylabs parsed, ScraperAPI,
  Zyte product/httpResponseBody). Merge each result as it lands (existing `mergeResult`).
- Return the quote the moment `hasRequiredFields && category != null` is true (fast mode already exists);
  abort the still-running requests via `AbortController`.
- t=+1.5 s with nothing required yet: start Zyte `browserHtml` (JS-rendered) as a hedge.
- Free parsers (`platform-html`, `structured-data`) run on whatever HTML arrives, when it arrives.
- Claude only ever runs **after** the response, in `after()` enrichment, or when every provider returned
  nothing (last resort, still capped at ~8 s).

Per-provider deadlines: structured 8 s, browser 15 s, total 20 s. Route `maxDuration` 30.

### 3. Classification without an LLM on the hot path

Category drives the pricing group, so it is on the critical path. Make it deterministic first:

- New table `store_category_map (store text, source_path text, tomame_category text, confidence, source: 'seed'|'llm'|'admin')`.
  Key = the store's own breadcrumb/category path (Amazon `Home & Kitchen›Furniture›Gaming Chairs`,
  Oxylabs `category.path`, Zyte `breadcrumbs`). Lookup is one indexed read; hit rate approaches 100 %
  after a few hundred quotes because store taxonomies are small.
- Miss → `claude-haiku-4-5-20251001` (not Opus), title + breadcrumb only, `max_tokens` 50, ~0.5–1 s.
  Write the answer back to `store_category_map` so the next item in that store category is free.
- Existing `AMAZON_CATEGORY_MAP` / `EBAY_CATEGORY_MAP` become the seed rows. Admin can correct a row
  (already an admin pricing concern; goes through `audit_logs`).

Weight stays background enrichment (Haiku over page text or `additionalProperties`), gated by
`weightMattersFor` as today.

### 4. Stores as data, not code — the "segment and group" piece

Today a store exists three times: `DOMAIN_REGION` in `url.ts`, `SupportedPlatform` in `registry.ts`,
`SUPPORTED_STORE_NAMES` for marketing. Replace with one table read by extraction, pricing and marketing
(`docs/redesign-data-map.md` already asks for `regions.store_names` and a 14-store marquee):

```
stores (
  slug text pk,                 -- 'amazon', 'walmart', 'bestbuy'
  name text, logo_path text,
  domains text[],               -- ['amazon.com','a.co'] ; subdomain match
  region_code text references regions(code),   -- USA/UK/CHINA → pricing region
  default_currency text,
  strategy jsonb,               -- { oxylabs: 'walmart', scraperapi: null, zyte: true, product_url: '^/ip/…' }
  status text,                  -- 'live' | 'beta' | 'waitlist'
  sort int
)
```

- `resolvePlatform`/`regionForUrl` read the table (cached in memory 5 min). Unknown host → still
  extract with Zyte generic, region `null`, message "store not yet supported, team confirms shipping"
  (never a 400 for a real product URL; the URL-shape 400 stays).
- The `PlatformScraper` Cheerio classes stay as the optional `platform-html` parser for stores that have one.
- Marketing "Stores we read", the marquee and the region cards read `stores` + `regions`. Nothing static.

Segmentation of the *product* record stays the current `ScrapedProduct` shape; add `variant`
(selected colour/size as one string) and `breadcrumbs: string[]` so grouping in the bag/journeys UI
("Amazon · USA", "Black · Qty 1") has a real source.

### 5. Perceived speed

- Response already carries `extraction_cache_id`; UI shows title/price/image at first byte, weight and
  final freight fill in via the existing `GET /api/extractions/:id` poll (2 s) until `complete && weight`
  or 3 polls. No SSE needed.
- Warm cache aggressively: the nightly price-watch cron already re-scrapes; add "re-extract the last 200
  quoted URLs whose TTL expires in the next hour" so popular links are always cached.
- Route stays on Vercel; move to Fluid compute (`experimental.fluid`) so warm instances handle the
  ~1 s cold start on cheerio + SDK imports.

## Build order (one PR each, approval between)

1. `stores` table + seed of the 16 domains in `url.ts` + Walmart/Target/Best Buy/Etsy/AliExpress/Temu;
   registry/url/marketing read it. No vendor change yet. Tests: resolve-platform, url.
2. Oxylabs resolver (parsed targets) + Zyte resolver (generic product), both optional keys; chain still
   sequential. Fixtures from one real call each, mapped like `mapScraperApiAmazon`.
3. Chain → parallel race with per-provider deadlines; Browserless out of the HTML path; budget 20 s.
4. `store_category_map` + Haiku classifier; Opus removed from the hot path.
5. UI progressive fill on the new quote screen (redesign Phase 3 owns the component).

Measure after each step with `scripts/extraction-bench.ts` (to write in step 2: 20 URLs across
stores, prints p50/p95 and per-tier ms from the chain outcome).

## Cost sketch at 1,000 quotes/day

Oxylabs Micro $49/mo covers ~50k–100k results. Zyte generic ~$1–3 per 1k for http tier, more for
browser tier; at a 30 % long-tail share ≈ $10–30/mo. Haiku classification is negligible and
decays with the map. Browserless residential GB billing goes away.
