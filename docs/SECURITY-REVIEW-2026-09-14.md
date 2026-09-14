# Security review, 2026-09-14

## 1. HTTP surface

Read-only adversarial review of every `route.ts` under `src/app/api` (90 files, 118 handlers), the pages under `src/app/app` and `src/app/admin` that read data, the proxy (`src/proxy.ts`, `src/lib/supabase/proxy.ts`), and every reachable `createAdminClient()` call. Claims were verified against the code (file:line below) and, where a probe could be made without writing to hosted data, against the local stack on `http://localhost:3000` (anonymous `curl`, then a `kwame@tomame.local` cookie jar; database facts from `docker exec supabase_db_tomame psql`, read-only).

Already fixed and not re-reported: `/api/admin` prefix gate, the `@tomame.ca` backdoor, the `profiles.role` PostgREST grant, the five spellings of "is admin", cron fail-open. The same shapes were looked for again; where one recurred it is listed.

Summary: no anonymous route returns another person's data. Every `/api/admin/*` handler checks the role itself (20 routes probed anonymously, all 401; the same with an image-extension suffix that skips the proxy, all 401 or 405). Ownership checks on customer id routes are uniform 404s. The holes are in money integrity, not in authentication: the price of an order is bound to a snapshot the client names, not to the URL the client names; an order flagged `needs_review` is payable at the customer-entered price; and two RLS write policies let a signed-in customer bypass the API's rate limits on the two jobs that spend vendor budget.

### 1.1 Holes

#### H1. Order price is bound to `extraction_cache_id`, not to `product_url`

`POST /api/orders` accepts `product_url` and an optional `extraction_cache_id` (`src/features/orders/schema.ts:13-40`). `buildOrderIntake` loads the snapshot by id (`src/features/orders/services/order-intake.service.ts:51-56`), prices from `snapshot.result.product.price` (lines 62-70, 91-112) and never compares `snapshot.productUrl` to `input.product_url`. `createOrder` then stores the client's `product_url` on the row (`src/features/orders/services/orders.service.ts:290-292`). `extraction_cache` is shared and any valid id is readable anonymously through `GET /api/extractions/:id`, so ids are not secret.

Exploit sketch: paste a $12.99 Amazon link to get its cache id (locally `58e76769-...` is `amazon.com/dp/B0CHX3QBCH` at 12.99). POST `/api/orders` with `extraction_cache_id` = that id, `product_url` = `https://www.amazon.com/dp/<a $2,000 laptop>`, `product_name` = the $12.99 item's exact title (so "Customer edited the product name" is not raised), `quantity` 1. `needs_review` stays false when the snapshot is complete and the country matches. The order is priced at 12.99 USD landed, is payable immediately (H2 is not even needed), and the buyer opens `product_url` to purchase a laptop. The bag path is not affected: `checkout.service.ts:141-155` takes `product_url` from `line.product.url`, which is `snapshot.productUrl`.

Fix: in `buildOrderIntake`, when a snapshot is present, ignore `input.product_url` and use `snapshot.productUrl` (mirror `orderInputFor`), or reject with 400 when `hashUrl(canonical(input.product_url)) !== snapshot.url_hash`. Consider removing the direct `POST /api/orders` path entirely in favour of the bag, since the UI already routes through it.

#### H2. A `needs_review` order is payable at the customer-entered price

`orderCharge` (`src/features/payments/services/payments.service.ts:386-410`) refuses only when the order is not `pending`, belongs to a group, has an active payment, or has a total of 0. It never reads `needs_review`. The total is `order.admin_total_ghs ?? order.pricing.total_ghs`, and for an order created with no snapshot (`extraction_cache_id` is optional) `pricing.total_ghs` is computed from `input.estimated_price_usd`, which the customer typed (`order-intake.service.ts:65-67`). The only thing hiding the Pay button is the client (`src/features/orders/components/order-card.tsx:146`). `groupCharge` (lines 412-438) has the same gap: `bag.has_unpriced_lines` is false for a gap-filled line, so a bag of `needs_review` orders is payable at the gap prices.

Exploit sketch: POST `/api/orders` with any supported store URL, no `extraction_cache_id`, `estimated_price_usd: 1`. The order is created `pending`, `needs_review: true`, priced from $1. POST `/api/payments/initialize` `{orderId}`; Paystack charges the GHS equivalent of $1 plus fees; the callback verifies the amount against the payment row (which was built from that total) and `linkOrderToPayment` moves the order to `paid` (`orders.service.ts:116-139`). The order now sits in the paid queue at the wrong price, and the state machine has been walked past the review the flag exists to force. The review service also does not void a `success` payment when it re-prices (`orders.review.service.ts:46-58` voids only `pending`).

Fix: in `orderCharge` and `groupCharge`, refuse (409) when `order.needs_review && order.admin_total_ghs == null`, and for a group when any member order is in that state. Optionally back it with a CHECK or a trigger on `payments` insert. `payment-reconciliation.service.ts:309` reads the same expression and should use one shared `chargeableTotal(order)` helper that throws for unreviewed orders.

#### H3. RLS write policies let a customer bypass the API on the two jobs that spend vendor money

`pg_policies` on the local database (migrations are the authority and match): `extraction_requests | owner write | ALL | USING/CHECK (user_id IS NOT NULL AND auth.uid() = user_id)` and `price_watches | owner write | ALL | USING/CHECK (auth.uid() = user_id)`. Table privileges for `authenticated` on both tables include INSERT, UPDATE, DELETE. The publishable key ships in the browser and any customer's JWT gives `authenticated`, so PostgREST at `NEXT_PUBLIC_SUPABASE_URL/rest/v1/...` accepts these writes directly.

Every server-side write already goes through the service role (`src/db/queries/extraction-requests.ts`, `src/db/queries/price-watches.ts`), so the policies serve no application path. What they do serve:

- `POST /rest/v1/extraction_requests` with `status: "pending"`, `attempts: 0`, any `product_url`/`url_hash`, `user_id` = self. `sweepExtractions` (`src/features/extraction/services/extraction-queue.service.ts:211-216`) claims every `pending` row oldest-first (`listQueuedExtractionRequests`, `extraction-requests.ts:307-317`) and runs the full resolver chain, ScraperAPI/Oxylabs/Zyte/Browserless/Claude included. The `/api/pastes` limiter (10 per 10 min per IP) is not consulted, `MAX_EXTRACTION_ATTEMPTS = 3` is per row and the row can be reset with a PATCH, and `job_budgets` is not read by this job (only the catalog scrape reads it). Effect: unbounded vendor spend and starvation of real customers' pastes.
- `POST /rest/v1/price_watches` with `is_active: true` and any `url`/`url_hash` bypasses `RATE_LIMIT.watches` (20 per hour) and `resolveAndPrice` validation; `runPriceWatchJob` re-checks every active watch (8 per 10-minute run), so a few hundred rows monopolise the job forever.
- A customer can also PATCH their own `extraction_requests` row to `status: "ready", extraction_cache_id: <any>`; `addPasteToBag` trusts that (`bag.service.ts:140-142`). Harmless today because any cache id is addable anyway, but it is a second write path into the bag that the service layer does not own.

Fix: drop both `owner write` policies (keep `owner read`), and `REVOKE INSERT, UPDATE, DELETE ON extraction_requests, price_watches FROM authenticated, anon`. Sweep the other `ALL` policies while there: `delivery_zones`, `regions`, `site_content`, `site_settings`, `media_overrides` are admin-gated by `profiles.role`, which is fine, but nothing in the app writes them with the user client either.

### 1.2 Weaknesses

Ranked by consequence.

W1. Cancelling a pending order ignores an in-flight payment; the money never settles. `cancelOrderByUser` (`orders.service.ts:637-676`) checks only `status === "pending"`. If the customer has a `pending` payment open in the Paystack tab, cancels the order, then completes the charge, `handlePaymentCallback` marks the payment `success`, `settleOrder` returns null because `linkOrderToPayment` requires `status = pending` (`orders.service.ts:116-127`), `ordersSettled` is 0, and the "refund review needed" log fires only when `recoveringExpired` (`payments.service.ts:540-546`). Result: a successful payment against a cancelled order with no alert and no audit marker. Fix: refuse cancel when `findActivePayment` returns a pending row (or void it first), and log/audit `ordersSettled === 0` unconditionally.

W2. The proxy matcher skips any path ending in an image extension. `src/proxy.ts:19` excludes `.*\.(?:svg|png|jpg|jpeg|gif|webp)$`. Every `/admin` page relies on the proxy alone (`src/app/admin/layout.tsx` has no check by design, comment at line 12; 19 of 22 admin pages make no auth call). Verified: anonymous `GET /admin/orders/x.png` and `/admin/transactions/x.png` returned 500, not the 307 to login the gate would give, meaning the page executed with the service role for an anonymous caller and only failed because `x.png` is not a UUID. Not exploitable today since ids are UUIDs and policy slugs are admin-set, but it is one text-typed segment away from a leak, and it also drops the `/api/admin` gate the 2026-09-13 fix relies on as the fail-closed default (each API route happens to self-check, so only the belt is gone). Fix: scope the exclusion to `_next/` and the public asset folders, or use explicit matchers `["/app/:path*", "/admin/:path*", "/api/:path*", "/auth/:path*"]`, and add a `canAccessAdmin` check in `admin/layout.tsx`.

W3. Anonymous quote endpoints mint database rows without a limit. `POST /api/products/extract` skips the rate limit on a cache hit (`src/app/api/products/extract/route.ts:47-53`). Each cookie-less request mints a new session (`src/lib/quote-session.ts:73-77`), writes an `extraction_requests` row (`extraction.service.ts:85, 107-113`), a `quote_locks` row and an `audit_logs` row (`quote-lock.service.ts:265-266, 327-369`). Verified locally: two cookie-less POSTs for a cached URL each answered 200 with a fresh `Set-Cookie: tm_quote_session=...`; `quote_locks` already holds 8 anonymous rows. `GET /api/extractions/:id` does the same at 60 per 15 minutes per IP. Fix: always rate-limit by IP (a looser bucket for cache hits), and do not mint a lock or paste row for a viewer whose cookie did not arrive with the request (set the cookie, lock on the next call or on add-to-bag).

W4. `GET /api/img-proxy` is anonymous, unlimited, and drives Browserless (paid). `src/app/api/img-proxy/route.ts:18-41` allowlists one host but takes any path and calls `fetchImageViaBrowser` per request with no `checkRateLimit`. Fix: rate limit by IP and sign `src` (HMAC issued when the server renders the image) so only URLs the app emitted can be proxied.

W5. The Next image optimizer is an open image proxy. `next.config.ts:5-8` allows `https://**`; verified `GET /_next/image?url=https://www.google.com/...png&w=64` returns 200 from the local server. Anyone can make the deployment fetch arbitrary https URLs and pay the bandwidth and function time. `localPatterns` correctly blocks `/api/admin/...` (returns 400). Fix: enumerate the store CDNs, or route product images through the signed proxy from W4 and set `remotePatterns` to that origin.

W6. Webhook HMAC compare is not constant-time. `src/lib/paystack/client.ts:124-133` uses `hash === signature`. The raw body is used (good, `webhook/paystack/route.ts:34-41`), the handler never trusts `event.data.amount` and re-verifies with Paystack comparing amount and currency (`payments.service.ts:471-494`, good), and replay is harmless because the payment row's status is checked first. Fix: `crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature))` after a length check.

W7. The rate limiter is a per-process `Map` (`src/lib/rate-limit/index.ts:16`). On Vercel each function instance has its own map and cold starts empty it, so every limit is multiplied by the number of warm instances and can be reset by pausing. Keys use the whole `x-forwarded-for` value, which Vercel sets from the connection (not spoofable there, spoofable on any other host). Money and vendor-spending routes and their current cover: extract 10 per 10 min but cache hits exempt (W3); pastes 10 per 10 min; payments initialize 10 per 15 min per IP, not per user; contact 6 per hour; waitlist 5 per hour; signup, login, forgot-password 10 per 15 min; img-proxy none (W4); catalog search 60 per 15 min with a pricing pass per hit; feedback 6 per hour per user. Fix: a shared store (Upstash, Vercel KV, or a Postgres counter table) for the money and vendor routes at least.

W8. `GET /api/orders/:id/history` returns raw `audit_logs` rows to the customer (`orders.service.ts:678-690` via `getOrderAuditLogs` 182-198, verified locally with `kwame`). Rows carry the admin's `actor_id`, and `order_price_set` includes `admin_pricing_note` (`orders.review.service.ts:262-268`), `order_review_rejected` includes the internal `reason`, both with `previousReviewReasons`. Fix: project to `{action, created_at, from, to}` or serve `order_events` (which already has `customerVisibleOnly`) instead.

W9. No security headers anywhere. `next.config.ts` sets none, `vercel.json` is `{}`; verified on `/app/products`: no CSP, no HSTS, no `X-Frame-Options`/`frame-ancestors`, no `Referrer-Policy`, no `X-Content-Type-Options` (the two file-serving routes set their own, `order-photos/[photoId]/route.ts:53-55`, `media/[key]/route.ts:48-50`). The admin console is framable. Fix: a `headers()` block with `frame-ancestors 'none'`, HSTS, nosniff, `Referrer-Policy: strict-origin-when-cross-origin`, and a CSP at least in report-only.

W10. CSRF posture rests on cookie defaults, not on a check. Every state-changing route authenticates by the Supabase cookie only; nothing checks `Origin` or `Sec-Fetch-Site`. `@supabase/ssr` sets `SameSite=Lax`, and the JSON bodies force a CORS preflight, so cross-site POST is blocked in practice. Two things weaken that: the multipart routes (`admin/orders/[id]/photos`, `admin/builder/[key]`, `admin/pricing-groups/import`) accept a body a plain HTML form can send, and two GETs mutate state (`/api/pricing/rates/refresh` spends the FX vendor quota; `/api/payments/callback` is safe because it verifies with Paystack). A top-level cross-site GET navigation does carry Lax cookies. Fix: in the proxy, reject non-GET `/api/*` requests whose `Origin` is present and not the app origin; make `rates/refresh` a POST.

W11. Admin role has two sources of truth and no revocation. RLS policies decide admin by `profiles.role` (`EXISTS (... profiles.role = 'admin')` and `is_admin()`), the app decides by the JWT claim that `custom_access_token_hook` copies from the same column at mint time. `PATCH /api/admin/users/:id` updates only `profiles.role` (`users.service.ts:314-340`); a demoted admin keeps `app_metadata.role = admin` until the access token expires (up to an hour) and no refresh-token revocation is performed. Fix: call `auth.admin.signOut(userId, "global")` after a role change; document that RLS and the app may disagree for one token lifetime.

W12. `GET /api/doc` (public, `src/app/api/doc/route.ts`) and the `/api-docs` page publish the full OpenAPI description including admin endpoints. Low; gate to admin or to non-production.

W13. `GET /api/pricing/rates/refresh` answers a refused caller with 500 `{"error":"Authentication Required"}` (`route.ts:46-50` maps every error to 500) and reuses the `admin-deliveries` bucket name (line 13). Also the only admin-gated route outside `/api/admin`, so it misses the prefix gate; it does self-check (lines 17-19).

W14. Password minimum disagrees: change-password API accepts 6 (`src/app/api/auth/change-password/route.ts:12`), signup and reset require `PASSWORD.minLength` 8 (`src/features/auth/schema.ts`). Reuse the shared schema.

W15. `TRUNCATE`, `TRIGGER`, `REFERENCES` are granted to `anon` and `authenticated` on every public table, including `audit_logs` and `profiles` (Supabase default privileges; 051 revoked only UPDATE). TRUNCATE ignores RLS. Not reachable through PostgREST or any RPC in the repo, so not a hole, but it contradicts "append-only". Fix: `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated` followed by explicit grants, and an explicit `REVOKE TRUNCATE` on existing tables.

W16. Quote lock can price two orders. Two concurrent `POST /api/orders` for the same snapshot both pass `resolveLockForOrder` (`order-intake.service.ts:125`), both price under the lock, and only one `consumeLock` wins (`quote-locks.ts:140-151`); the loser's order is already inserted and the failure is only logged (`orders.service.ts:334-352`). Locks only ever lower the price (`priceLowerOf`, `ratchetLockRate` uses `gt`), so the loss is bounded by the lock window. Locks cannot be minted for another viewer (`findActiveLock` filters by `user_id` or `session_id AND user_id IS NULL`, `quote-locks.ts:77-79`).

W17. `tm_quote_session` is an unsigned bearer capability. Random UUID v4 (122 bits, `quote-session.ts:36-38`), `httpOnly`, `Lax`, `secure` in production, so forging is infeasible (a value pulled from the local database did open that visitor's empty bag, as designed). On login the holder's cart, locks and pastes are adopted into the account (`bag.service.ts:250-269`, `quote-lock.service.ts:311-325`), so a cookie planted in a victim's browser (a sibling-subdomain toss, or XSS) injects lines into their bag. Consider the `__Host-` prefix and an HMAC over the id.

W18. Admin photo upload does not check that `event_id` belongs to the order (`admin/orders/[id]/photos/route.ts:39`, service `order-photos.service.ts:122-133`). Admin-only; a typo links a photo to another order's event.

W19. Policy content is rendered as raw HTML (`src/features/policies/components/policy-html.tsx:58`) with no sanitiser in the dependency list. Author is admin-only, so this is stored XSS by a compromised admin against every visitor. Low; run it through `rehype-sanitize` or store markdown only.

W20. `special_instructions`, `product_name` and `product_image_url` are customer-controlled and shown in the admin console. React escapes the text; the image is loaded through the optimizer, so a customer can make an admin's browser fetch a tracking pixel. Low.

### 1.3 Service-role coverage (every reachable `createAdminClient()` re-checks the caller)

`grep -rn createAdminClient src/` lists 340 hits; the ones reachable from a request and what proves the caller is allowed:

| Service or query | Reachable from | Ownership or role proof |
|---|---|---|
| `order-photos.service.ts` `readOrderPhotoForViewer` 291-299 | `GET /api/order-photos/:photoId` | `is_customer_visible`, then `getOrderOwner(...).user_id === viewer.id` unless admin; all refusals 404 |
| `order-photos.service.ts` `removeOrderPhoto` 211-214, `uploadOrderPhotos` 98 | admin photo routes | route: `canAccessAdmin(session)`; photo must belong to `:id` |
| `feedback.service.ts` 61-64, 142-153 | `/api/orders/:id/feedback` | `getOrderOwner(...).user_id === user.id` or admin; 404 |
| `feedback.service.ts` `moveOrderFeedback` | `PATCH /api/admin/order-feedback/:id` | route: `canAccessAdmin(session)` |
| `orders.service.ts` `getOrder` 406-412, `cancelOrderByUser` 641-647, `getOrderAuditHistory` 683-687 | `/api/orders/:id`, `/cancel`, `/history` | `order.user_id === user.id` or admin; 404 (history leaks, W8) |
| `orders.service.ts` `updateOrderStatusAdmin` 469 | `PATCH /api/admin/orders/:id` | `canAccessAdmin(user)` inside the service as well as `requireAdmin` in the route |
| `order-events.service.ts` `listCustomerOrderEvents` 93-97 | `/api/orders/:id/events` | owner or admin; 404; `customerVisibleOnly: true` |
| `order-hold.service.ts`, `admin-eta.service.ts`, `orders.review.service.ts` | admin routes | route-level `canAccessAdmin` |
| `notifications.service.ts` 137-138, 178-180, 218-222 | `/api/notifications*` | filtered by `user.id`; `markNotificationRead` compares `row.user_id`; 404 |
| `db/queries/delivery-addresses.ts` via `addresses.service.ts` `getOwned` 76-80 | `/api/addresses*` | `row.user_id !== userId` gives 404; inserts use the session user id |
| `db/queries/carts.ts` via `bag.service.ts` `resolveCart` 250-269, `ownedLine` 275-279 | `/api/cart*` | cart found by `viewer` (user id, else session id with `user_id IS NULL`); line must be in that cart; 404 |
| `checkout.service.ts` | `POST /api/cart/checkout` | `requireAuth` then viewer-scoped bag; addresses re-checked in `setBagDelivery` 225-227 |
| `db/queries/quote-locks.ts` 62-84, 160-183 | quote flow, order intake | filtered by viewer; `consumeLock` by an id the server resolved |
| `db/queries/extraction-requests.ts` `ownerFilter` 95-98, `getExtractionRequestForViewer` 195 | `/api/pastes*`, bag | filtered by viewer; `ownsRequest` in `bag.service.ts:174-177` |
| `db/queries/extraction-cache.ts` | `/api/extractions/:id`, `/api/pricing/preview`, intake | shared product data, public by design (no PII) |
| `assisted.service.ts` 45-46, 109-112 | `/api/assisted-requests` | viewer identity required; revise path checks owner |
| `watches.service.ts` `requireOwnedWatch` 440-442 | `/api/watches/:id*` | `row.user_id !== userId` gives 404 |
| `payments.service.ts` `orderCharge` 388-389, `groupCharge` 414 | `POST /api/payments/initialize` | `order.user_id === user.id`, 404 |
| `payments.service.ts` `handlePaymentCallback` 440 | `GET /api/payments/callback` (anonymous) | keyed by reference `TOM_<ms>_<6 random bytes>`; regex-validated; idempotent; result always re-verified with Paystack |
| `users.service.ts` | `/api/admin/users*` | `requireAdmin` in routes |
| `auth.service.ts` `forgotPassword` 123-137 | `POST /api/auth/forgot-password` | lookup by email for the audit row only; uniform response |
| `app/me/activity/route.ts` 11-17 | `GET /api/app/me/activity` | `.eq("actor_id", auth.id)` |
| `policies/route.ts`, `policies/[slug]/route.ts` | anonymous | `is_published = true` filter |
| `media.service.ts` via `/api/media/[key]` | anonymous | `isMarketingImageKey` allowlist, storage path from the override row |
| `journey-detail.service.ts` 41-47 | `/app/orders/:id` page | calls `getOrder(client, user, id)` first, so owner or admin, 404 otherwise |
| `admin-*.ts` queries, `admin-dashboard.ts`, `admin-pastes.service.ts` | `/api/admin/*` and `/admin` pages | API: per-route check. Pages: proxy only (W2) |
| `exchange-rates/service.ts`, `pricing-constants.ts`, `pricing-groups.ts`, `fixed-freight-items.ts`, `store-category-map.ts`, `catalog.ts`, `notify-preference.ts`, `audit.service.ts`, `image-upload.ts` | internal reads and writes | no caller-specific data |

No route trusts a client-supplied `user_id`, `role`, `status`, payment status or price total. The one price the client may supply, `estimated_price_usd`, is used only as a gap filler when the snapshot has no price (`gapFillOverrides`, `quote.service.ts:25-30`) and flags `needs_review` (which H2 then fails to enforce).

### 1.4 Input handling notes

- Every JSON body is parsed with zod. Three admin routes call `request.json()` without a `.catch` (`admin/users`, `admin/users/[id]`, `admin/pricing-constants`, `admin/pricing-groups*`, `admin/category-mappings*`, `auth/reset-password`); a malformed body is a 500 rather than a 400. Harmless.
- Query strings on `/api/catalog/search`, `/api/pricing/preview`, `/api/watches/:id/history` are zod-validated. `/api/admin/orders` passes `status` and `userId` straight into `.eq()` filters (PostgREST parameterises, no injection).
- `quote_locks`: cannot be minted for another viewer, cannot be consumed twice by the same id (`is consumed_by_order_id null`), can be read twice under a race (W16). No replay: a lock id in the body is not accepted anywhere; the intake resolves it itself.
- `tm_quote_session`: see W17.
- Public flow (`/app/orders/new`, `/app/orders/review/:id`, `/app/bag`, `/app/products` and their APIs): read shared product data and the viewer's own bag; nothing belonging to anyone else is reachable. `/app/orders/review/x.png` answered 200 anonymously, which is by design.

### 1.5 Webhook (`src/app/api/payments/webhook/paystack/route.ts`)

Raw body read with `request.text()` and the HMAC-SHA512 computed over it (lines 34-41). Signature compare is `===` (W6). Only `charge.success` is handled and the handler ignores `event.data.amount`: it loads the payment by reference and calls `handlePaymentCallback`, which verifies with `GET /transaction/verify/:ref` and compares amount and currency to the stored row (`payments.service.ts:483-505`). Replay of a captured event is idempotent (`status === success` short-circuit at 698-700). Rate limited 100 per minute per IP. No replay window or event-id dedupe table; not needed given the above.

### 1.6 Headers and CSRF

Covered in W9 and W10. `src/lib/supabase/server.ts` and `proxy.ts` accept `@supabase/ssr` cookie defaults (Lax). No CORS headers are set anywhere, so browsers enforce same-origin for `fetch`. The quote-session cookie is set `Lax`, `httpOnly`, `secure` in production.

### Appendix A. Route table

Caller key: anon = anyone; session = any signed-in user; owner = signed-in and must own the row (404 otherwise); admin = `app_metadata.role === "admin"`; cron = `Authorization: Bearer CRON_SECRET`; hmac = Paystack signature. "proxy" means the `/api/admin` prefix gate in `src/lib/supabase/proxy.ts:80-113` also applies. RL = rate limit bucket from `src/config/security.ts`.

| Path | Method | Caller | Proof | Reads / writes | Verdict |
|---|---|---|---|---|---|
| /api/addresses | GET, POST | session | `addresses/route.ts:17-19` | own `delivery_addresses` (RL general) | ok |
| /api/addresses/[id] | PATCH, DELETE | owner | `addresses/[id]/route.ts:19-25`, `addresses.service.ts:76-80` | own address | ok |
| /api/admin/assisted-requests | GET | admin + proxy | `route.ts:26-27` | all `assisted_requests` | ok |
| /api/admin/assisted-requests/[id] | PATCH | admin + proxy | `route.ts:32-33` | transition, audit | ok |
| /api/admin/builder/[key] | POST, PATCH, DELETE | admin + proxy, plus `isBuilderEnabled()` 404 | `route.ts:37-54` | storage object, `media_overrides`, audit | ok |
| /api/admin/category-mappings | GET, PUT | admin + proxy | `route.ts:18-20, 50-52` | `category_pricing_map` | ok |
| /api/admin/category-mappings/[category] | PATCH, DELETE | admin + proxy | `route.ts:23-25, 89-91` | one mapping, audit | ok |
| /api/admin/contact-messages | GET | admin + proxy | `route.ts:20-21` | all `contact_messages` | ok |
| /api/admin/contact-messages/[id] | PATCH | admin + proxy | `route.ts:33-34` | transition, audit | ok |
| /api/admin/content | PATCH | admin + proxy | `route.ts:119-121` | `site_settings`, `site_content`, `regions`, `delivery_zones`, audit | ok |
| /api/admin/dashboard | GET | admin + proxy | `route.ts:43-44` | aggregates via service role | ok |
| /api/admin/exchange-rates | GET | admin + proxy | `route.ts:16-18` | `exchange_rates` | ok |
| /api/admin/notifications | GET | admin + proxy | `route.ts:47-49` | all `notifications` | ok |
| /api/admin/order-feedback | GET | admin + proxy | `route.ts:31-32` | all `order_feedback` | ok |
| /api/admin/order-feedback/[id] | PATCH | admin + proxy | `route.ts:37-38` | guarded transition, audit | ok |
| /api/admin/orders | GET | admin + proxy | `route.ts:26-28` | all orders via user client (RLS admin policy) | ok |
| /api/admin/orders/[id] | GET, PATCH | admin + proxy | `route.ts:28-30, 61-63`; service 469 | order status, `order_deliveries`, events, audit, email | ok |
| /api/admin/orders/[id]/eta | PATCH | admin + proxy | `route.ts:56-57` | eta columns, audit | ok |
| /api/admin/orders/[id]/hold | POST, DELETE | admin + proxy | `route.ts:58-59, 86-87` | `held_at`, `hold_reason`, audit | ok |
| /api/admin/orders/[id]/photos | GET, POST | admin + proxy | `route.ts:57-58, 133-134` | `order_photos`, `parcel-photos` bucket, audit, customer notification | ok (W18) |
| /api/admin/orders/[id]/photos/[photoId] | DELETE | admin + proxy | `route.ts:28-29`; service 211-214 requires `photo.order_id === id` | row + object, audit | ok |
| /api/admin/orders/[id]/review | POST | admin + proxy | `route.ts:28-29` | pricing, `admin_total_ghs`, voids pending payments, audit, email | ok |
| /api/admin/pastes | GET | admin + proxy | `route.ts:28-29` | `extraction_requests` queue | ok |
| /api/admin/pastes/[id]/rerun | POST | admin + proxy | `route.ts:37-38` | requeue and run one extraction (vendor spend) | ok |
| /api/admin/policies | POST | admin + proxy | `route.ts:27-29` (no RL) | `policies`, audit | ok |
| /api/admin/policies/[slug] | PUT, DELETE | admin + proxy | `route.ts:31-33, 63-65` (DELETE no RL) | `policies`, audit | ok |
| /api/admin/pricing-constants | GET, PATCH | admin + proxy | `route.ts:23-25, 48-50` | `pricing_constants`, audit | ok |
| /api/admin/pricing-constants/preview | POST | admin + proxy | `route.ts:50-52` | pure calculation | ok |
| /api/admin/pricing-groups | GET, POST | admin + proxy | `route.ts:18-20, 62-64` | `pricing_groups`, audit | ok |
| /api/admin/pricing-groups/[id] | GET, PATCH, DELETE | admin + proxy | `route.ts:21-23, 58-60, 126-128` | one group, audit | ok |
| /api/admin/pricing-groups/export | GET | admin + proxy | `route.ts:16-18` | xlsx of pricing | ok |
| /api/admin/pricing-groups/import | POST | admin + proxy | `route.ts:19-21` | bulk pricing write, audit | ok |
| /api/admin/queue-counts | GET | admin + proxy | `route.ts:27-28` | counts | ok |
| /api/admin/transactions | GET | admin + proxy | `route.ts:17-19` | all `payments` | ok |
| /api/admin/transactions/[id] | GET | admin + proxy | `route.ts:23-25` | one payment | ok |
| /api/admin/transactions/[id]/check | POST | admin + proxy | `route.ts:34-36` | Paystack verify (read) | ok |
| /api/admin/transactions/[id]/sync | POST | admin + proxy | `route.ts:23-25` | payment status from Paystack, audit | ok |
| /api/admin/users | GET, POST | admin + proxy | `route.ts:26-28, 47-49` | `auth.users`, `profiles`, audit | ok |
| /api/admin/users/[id] | GET, PATCH | admin + proxy | `route.ts:25-27, 47-49` | `profiles.role`, audit | ok (W11) |
| /api/admin/users/[id]/reset-password | POST | admin + proxy | `route.ts:20-22` | sends reset email | ok |
| /api/app/me | GET, PATCH | session | `route.ts:10-11, 39-40` | own profile, column-granted update, audit | ok |
| /api/app/me/activity | GET | session | `route.ts:8-9`, filter 15 | own `audit_logs` (20) | ok |
| /api/app/profile | GET, PATCH | anon (308 redirect to /api/app/me) | `route.ts:4-16` | nothing | ok |
| /api/assisted-requests | POST | anon with viewer identity | `route.ts:37-38`; service 45-46 | `assisted_requests` (RL assisted) | ok |
| /api/auth/change-password | POST | session | `route.ts:30-31`, re-auth in service 183-192 | password, audit | ok (W14) |
| /api/auth/forgot-password | POST | anon | RL `route.ts:10-13` | reset email, audit | ok |
| /api/auth/login | POST | anon | RL `route.ts:10-13` | session cookies, audit | ok |
| /api/auth/reset-password | POST | recovery session | `route.ts:22-23` | password | ok |
| /api/auth/signup | POST | anon | RL `route.ts:10-13` | `auth.users`, audit | ok |
| /api/cart | GET, POST, PATCH | anon or session, viewer-scoped | `route.ts:26-27, 39-40, 59-60`; `bag.service.ts:250-269` | own cart, `quote_locks`, `consolidation_boxes` | ok |
| /api/cart/checkout | POST | session, viewer-scoped | `route.ts:21-25` | `order_groups`, `orders`, cart status, audit | ok (H2 via gap prices) |
| /api/cart/items/[id] | PATCH, DELETE | viewer owns cart line | `route.ts:19-26`; `bag.service.ts:275-279` | own line | ok |
| /api/catalog/search | GET | anon | RL `route.ts:25-27`, zod 18-21 | `catalog_products`, pricing calc | ok |
| /api/contact | POST | anon | RL `route.ts:39-41` | `contact_messages` | ok |
| /api/cron/catalog-scrape | GET | cron | `runCronJob` → `authorizeCron` (`lib/auth/cron.ts:20-38`) | catalog scrape (vendor spend), heartbeat | ok |
| /api/cron/exchange-rates | GET | cron | same | `exchange_rates` | ok |
| /api/cron/price-watches | GET | cron | same | re-checks watches (vendor spend) | ok (H3 feeds it) |
| /api/cron/reconcile-payments | GET | cron | same | payments and orders state | ok |
| /api/cron/sweep-extractions | GET | cron | same | runs queued extractions (vendor spend) | ok (H3 feeds it) |
| /api/doc | GET | anon | none | OpenAPI spec | weak (W12) |
| /api/extractions/[id] | GET | anon, viewer-scoped lock | RL `route.ts:23-26` | any `extraction_cache` row by id, mints lock | ok (W3) |
| /api/health | GET | anon | none | nothing | ok |
| /api/img-proxy | GET | anon | host allowlist `route.ts:14-39`, no RL | Browserless fetch | weak (W4) |
| /api/media/[key] | GET | anon | key allowlist `route.ts:27` | marketing image from private bucket | ok |
| /api/notifications | GET | session | `route.ts:16-17`; service filters by `user.id` | own notifications | ok |
| /api/notifications/[id]/read | PATCH | owner | `route.ts:36-37`; service 178-180 | own row `read_at` | ok |
| /api/notifications/read-all | POST | session | `route.ts:22-23` | own rows | ok |
| /api/order-photos/[photoId] | GET | owner or admin | `route.ts:37-43`; service 291-299 | photo bytes, `no-store`, sandbox CSP | ok (model) |
| /api/orders | GET | session | `route.ts:57-58` | own orders | ok |
| /api/orders | POST | session | `route.ts:33-34`; intake prices from snapshot | `orders`, lock consume, audit, email | hole (H1, H2) |
| /api/orders/[id] | GET | owner or admin | `route.ts:13-14`; service 406-412 | one order | ok |
| /api/orders/[id]/cancel | POST | owner | `route.ts:12-13`; service 641-647 | status pending→cancelled, event, audit, email | weak (W1) |
| /api/orders/[id]/events | GET | owner or admin | `route.ts:25-26`; service 93-97 | customer-visible events | ok |
| /api/orders/[id]/feedback | GET, POST | owner (admin may read) | `route.ts:33-34, 57-58`; service 61-64, 142-153 | `order_feedback`, audit | ok |
| /api/orders/[id]/history | GET | owner or admin | `route.ts:12-13`; service 683-687 | raw `audit_logs` for the order | weak (W8) |
| /api/pastes | GET, POST | anon, viewer-scoped | `route.ts:45-51, 94-97`; owner filter `extraction-requests.ts:95-98` | own `extraction_requests`; POST runs extraction (RL extraction) | ok (W3) |
| /api/pastes/[id] | GET | viewer owns paste | `route.ts:32-36`; `getExtractionRequestForViewer` 195 | one paste, 404 otherwise | ok |
| /api/payments/callback | GET | anon with reference | regex `payments/schema.ts:13-17`; verify 471-494 | payment and order status, audit | ok |
| /api/payments/initialize | POST | owner of order or group | `route.ts:23-24`; service 388-389, 414 | `payments` row, Paystack init, audit | hole (H2) |
| /api/payments/webhook/paystack | POST | hmac | `route.ts:37-41` | via callback path | ok (W6) |
| /api/policies | GET | anon | `is_published` filter | published policies | ok |
| /api/policies/[slug] | GET | anon | `is_published` filter | one policy | ok |
| /api/pricing/preview | GET | anon, viewer-scoped lock | RL `route.ts:41-44`, zod 30-37 | pricing calc, may mint lock | ok (W3) |
| /api/pricing/rate | GET | anon | RL `route.ts:24-27` | cached FX row | ok |
| /api/pricing/rates/refresh | GET | admin (self-check only) | `route.ts:17-19` | FX vendor fetch, `exchange_rates` | weak (W10, W13) |
| /api/products/extract | POST | anon, viewer-scoped | RL only when uncached `route.ts:47-53` | extraction (vendor spend), `extraction_cache`, `extraction_requests`, lock | weak (W3) |
| /api/transactions | GET | session | `route.ts:9-10` | own payments via user client | ok |
| /api/waitlist | POST | anon | RL `route.ts:29-32` | `waitlist_signups` | ok |
| /api/watches | GET, POST | session | `route.ts:25-26, 40-41` | own watches; POST runs an extraction (RL watches) | ok (H3 bypass) |
| /api/watches/[id] | DELETE | owner | `route.ts:21-22`; service 440-442 | own watch, audit | ok |
| /api/watches/[id]/history | GET | owner | `route.ts:23-24`; service 440-442 | own `price_observations` | ok |

Pages: `/admin/**` (22 pages) rely on the proxy gate only (W2); `/app/orders/[id]` checks in `journey-detail.service.ts:41-47`; `/app/orders`, `/app/account`, `/app/watches`, `/app/transactions` rely on the proxy; `/app/orders/new`, `/app/orders/review/[id]`, `/app/bag`, `/app/products` are public by design. No `"use server"` actions exist in `src/`.

Local probe log (anonymous unless stated): 20 `/api/admin/*` GETs → 401; 11 `/api/admin/**/x.png` GET and DELETE → 401 or 405; `/api/cron/exchange-rates` → 401; customer id routes → 401; `/api/pastes`, `/api/cart` → 200 with an empty viewer; `/api/doc` → 200; `/admin/orders/x.png` → 500 (gate skipped); `/_next/image?url=https://www.google.com/...` → 200 image/png. As `kwame`: own order, feedback, events, history → 200; unknown or malformed order ids → 404 with the same body; `/api/admin/*` → 403; `/api/pricing/rates/refresh` → 500 "Authentication Required" is the admin refusal.
