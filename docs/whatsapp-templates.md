# WhatsApp templates (Meta Cloud API)

WhatsApp only delivers messages a business starts (every Tomame update) as
**pre-approved templates**. The 17 below are the whole set; the code that fills
them is `src/lib/whatsapp/templates.ts`. The body text here and in that file
must match character for character — if one changes, change the other and
resubmit the template in Meta, or sends fail with 132000/132001.

The channel is **off** until `WHATSAPP_ACCESS_TOKEN` and
`WHATSAPP_PHONE_NUMBER_ID` are set. Until then nothing is queued, nothing is
sent, and `/admin/notifications` shows a "WhatsApp not configured" banner.

## Switching it on

1. **Meta Business Manager → WhatsApp Manager**: create (or use) a WhatsApp
   Business Account, add and verify the sending phone number, and finish
   business verification (needed to leave the 250-conversations/day tier).
2. **Message templates → Create template**, once per template below: category
   **Utility**, language **English** (code `en`, not `en_US`), paste the body
   exactly, add the button, fill in the sample values, submit. Approval is
   usually minutes to a day. Use the production domain in the button URL (e.g.
   `https://tomame.com/{{1}}`) — every button uses the same base, with the path
   as the dynamic part.
3. **developers.facebook.com → your app → WhatsApp → API setup**: copy the
   **Phone number ID**. Create a **System User** in Business Settings, give it
   the app and the WhatsApp account with `whatsapp_business_messaging` and
   `whatsapp_business_management`, and generate a **permanent token** (the
   24-hour test token will expire).
4. **App settings → Basic**: copy the **App secret**.
5. On Vercel (dev and prod), set:
   - `WHATSAPP_ACCESS_TOKEN` — the system-user token
   - `WHATSAPP_PHONE_NUMBER_ID` — from step 3
   - `WHATSAPP_APP_SECRET` — from step 4 (verifies webhook signatures)
   - `WHATSAPP_VERIFY_TOKEN` — any long random string you choose
   - `WHATSAPP_API_VERSION` — optional, defaults to `v24.0`
   Redeploy.
6. **App → WhatsApp → Configuration → Webhook**: callback URL
   `https://<production domain>/api/webhooks/whatsapp`, verify token = the
   `WHATSAPP_VERIFY_TOKEN` value, **Verify and save**, then subscribe to the
   **messages** field (it carries the delivery statuses).
7. Apply migration 079 on the hosted database (it schedules the
   `whatsapp-dispatch` cron; it needs the `app_url` / `cron_secret` vault
   secrets every other job uses).
8. Opt yourself in on `/app/account?tab=notifications` with your number on the
   profile, place a test order, and watch the row in `/admin/notifications`
   go Queued → Accepted → Delivered → Read.

A template that is still pending or was rejected fails its rows permanently
with code 132001 ("Template does not exist or is not approved in this
language"), visible on the admin screen. Sending is otherwise unaffected.

## How a message flows

The event (e.g. payment confirmed) writes a `notifications` row, channel
`whatsapp`, status `pending` — only when the channel is configured, the
customer opted in and their profile number is usable. `/api/cron/whatsapp-dispatch`
(pg_cron, every minute) sends up to 20 due rows. Meta accepting it → `sent`;
a rate limit or Meta fault → retried after 1 then 5 minutes; a permanent error
or the third failure → `failed` with the reason. The webhook then records
`delivered` / `read` / carrier `failed` in `delivery_status`.

## The templates

### 1. `tomame_order_placed` — Order placed (ready to pay)

| Field | Value |
|---|---|
| Name | `tomame_order_placed` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | none |
| Button | Visit website — text **Pay now**, URL type **Dynamic**, URL `https://<production domain>/{{1}}` |

Body (paste exactly):

```
Hi {{1}}, we've got your order for {{2}}. Your total is GH₵ {{3}}. Pay with Mobile Money or card when you're ready and our buyers will get started.
```

Sample values:

- `{{1}}` → Ama
- `{{2}}` → Nike Air Max 90 (size 42)
- `{{3}}` → 1,845.20
- Button URL `{{1}}` → `app/orders/3f2a9c1e-7b4d-4e0a-9f61-2c8d5b7a1e90`

Preview: _Hi Ama, we've got your order for Nike Air Max 90 (size 42). Your total is GH₵ 1,845.20. Pay with Mobile Money or card when you're ready and our buyers will get started._

### 2. `tomame_order_in_review` — Order placed (needs review first)

| Field | Value |
|---|---|
| Name | `tomame_order_in_review` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | none |
| Button | Visit website — text **View order**, URL type **Dynamic**, URL `https://<production domain>/{{1}}` |

Body (paste exactly):

```
Hi {{1}}, thanks for your order for {{2}}. Our team is checking a few details first, so there's nothing to pay yet. We'll message you as soon as it's ready.
```

Sample values:

- `{{1}}` → Ama
- `{{2}}` → Dyson V8 cordless vacuum
- Button URL `{{1}}` → `app/orders/3f2a9c1e-7b4d-4e0a-9f61-2c8d5b7a1e90`

Preview: _Hi Ama, thanks for your order for Dyson V8 cordless vacuum. Our team is checking a few details first, so there's nothing to pay yet. We'll message you as soon as it's ready._

### 3. `tomame_order_paid` — Payment confirmed

| Field | Value |
|---|---|
| Name | `tomame_order_paid` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | none |
| Button | Visit website — text **Track order**, URL type **Dynamic**, URL `https://<production domain>/{{1}}` |

Body (paste exactly):

```
Hi {{1}}, payment received for {{2}}. Thank you! Our buyers are on it, and we'll update you at every step.
```

Sample values:

- `{{1}}` → Kofi
- `{{2}}` → Apple AirPods Pro (2nd generation)
- Button URL `{{1}}` → `app/orders/3f2a9c1e-7b4d-4e0a-9f61-2c8d5b7a1e90`

Preview: _Hi Kofi, payment received for Apple AirPods Pro (2nd generation). Thank you! Our buyers are on it, and we'll update you at every step._

### 4. `tomame_order_processing` — Buying from the store

| Field | Value |
|---|---|
| Name | `tomame_order_processing` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | none |
| Button | Visit website — text **Track order**, URL type **Dynamic**, URL `https://<production domain>/{{1}}` |

Body (paste exactly):

```
Hi {{1}}, we're buying {{2}} from the store now. Once it reaches our hub and heads for Ghana, you'll get the tracking details.
```

Sample values:

- `{{1}}` → Kofi
- `{{2}}` → Apple AirPods Pro (2nd generation)
- Button URL `{{1}}` → `app/orders/3f2a9c1e-7b4d-4e0a-9f61-2c8d5b7a1e90`

Preview: _Hi Kofi, we're buying Apple AirPods Pro (2nd generation) from the store now. Once it reaches our hub and heads for Ghana, you'll get the tracking details._

### 5. `tomame_order_shipped` — Shipped / in transit

| Field | Value |
|---|---|
| Name | `tomame_order_shipped` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | none |
| Button | Visit website — text **Track order**, URL type **Dynamic**, URL `https://<production domain>/{{1}}` |

Body (paste exactly):

```
Hi {{1}}, {{2}} has left our hub and is on its way to Ghana. Tracking: {{3}}. We'll let you know the moment it arrives.
```

Sample values:

- `{{1}}` → Esi
- `{{2}}` → Instant Pot Duo 7-in-1
- `{{3}}` → DHL 1234567890
- Button URL `{{1}}` → `app/orders/3f2a9c1e-7b4d-4e0a-9f61-2c8d5b7a1e90`

Preview: _Hi Esi, Instant Pot Duo 7-in-1 has left our hub and is on its way to Ghana. Tracking: DHL 1234567890. We'll let you know the moment it arrives._

### 6. `tomame_order_delivered` — Delivered

| Field | Value |
|---|---|
| Name | `tomame_order_delivered` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | none |
| Button | Visit website — text **View order**, URL type **Dynamic**, URL `https://<production domain>/{{1}}` |

Body (paste exactly):

```
Hi {{1}}, {{2}} has been delivered. We hope you love it! Thank you for shopping with Tomame.
```

Sample values:

- `{{1}}` → Esi
- `{{2}}` → Instant Pot Duo 7-in-1
- Button URL `{{1}}` → `app/orders/3f2a9c1e-7b4d-4e0a-9f61-2c8d5b7a1e90`

Preview: _Hi Esi, Instant Pot Duo 7-in-1 has been delivered. We hope you love it! Thank you for shopping with Tomame._

### 7. `tomame_order_cancelled` — Order cancelled

| Field | Value |
|---|---|
| Name | `tomame_order_cancelled` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | none |
| Button | Visit website — text **View order**, URL type **Dynamic**, URL `https://<production domain>/{{1}}` |

Body (paste exactly):

```
Hi {{1}}, your order for {{2}} has been cancelled. If you paid, we'll refund the same Mobile Money wallet or card, usually within 3 to 5 working days.
```

Sample values:

- `{{1}}` → Yaw
- `{{2}}` → Samsung Galaxy Buds2 Pro
- Button URL `{{1}}` → `app/orders/3f2a9c1e-7b4d-4e0a-9f61-2c8d5b7a1e90`

Preview: _Hi Yaw, your order for Samsung Galaxy Buds2 Pro has been cancelled. If you paid, we'll refund the same Mobile Money wallet or card, usually within 3 to 5 working days._

### 8. `tomame_order_approved` — Order approved after review

| Field | Value |
|---|---|
| Name | `tomame_order_approved` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | none |
| Button | Visit website — text **Pay now**, URL type **Dynamic**, URL `https://<production domain>/{{1}}` |

Body (paste exactly):

```
Hi {{1}}, good news: we've checked your order for {{2}} and it can go ahead. Your total is GH₵ {{3}}. Pay when you're ready and our buyers will start.
```

Sample values:

- `{{1}}` → Abena
- `{{2}}` → Dyson V8 cordless vacuum
- `{{3}}` → 3,210.00
- Button URL `{{1}}` → `app/orders/3f2a9c1e-7b4d-4e0a-9f61-2c8d5b7a1e90`

Preview: _Hi Abena, good news: we've checked your order for Dyson V8 cordless vacuum and it can go ahead. Your total is GH₵ 3,210.00. Pay when you're ready and our buyers will start._

### 9. `tomame_order_rejected` — Order rejected after review

| Field | Value |
|---|---|
| Name | `tomame_order_rejected` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | none |
| Button | Visit website — text **View order**, URL type **Dynamic**, URL `https://<production domain>/{{1}}` |

Body (paste exactly):

```
Hi {{1}}, we're sorry, we can't go ahead with your order for {{2}}. Reason: {{3}}. Nothing has been charged.
```

Sample values:

- `{{1}}` → Abena
- `{{2}}` → Lithium power bank 30000mAh
- `{{3}}` → airlines will not carry this battery size
- Button URL `{{1}}` → `app/orders/3f2a9c1e-7b4d-4e0a-9f61-2c8d5b7a1e90`

Preview: _Hi Abena, we're sorry, we can't go ahead with your order for Lithium power bank 30000mAh. Reason: airlines will not carry this battery size. Nothing has been charged._

### 10. `tomame_parcel_photo` — Parcel photo at the hub

| Field | Value |
|---|---|
| Name | `tomame_parcel_photo` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | none |
| Button | Visit website — text **See photo**, URL type **Dynamic**, URL `https://<production domain>/{{1}}` |

Body (paste exactly):

```
Hi {{1}}, {{2}} has reached our hub and we've added a photo of your parcel. Take a look on your order page.
```

Sample values:

- `{{1}}` → Kwame
- `{{2}}` → Order TM-10482 (Nike Air Max 90)
- Button URL `{{1}}` → `app/orders/3f2a9c1e-7b4d-4e0a-9f61-2c8d5b7a1e90`

Preview: _Hi Kwame, Order TM-10482 (Nike Air Max 90) has reached our hub and we've added a photo of your parcel. Take a look on your order page._

### 11. `tomame_payment_expired` — Payment expired

| Field | Value |
|---|---|
| Name | `tomame_payment_expired` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | none |
| Button | Visit website — text **Try again**, URL type **Dynamic**, URL `https://<production domain>/{{1}}` |

Body (paste exactly):

```
Hi {{1}}, your payment of GH₵ {{2}} (ref {{3}}) wasn't completed in time, so nothing was charged. You can try again whenever you're ready.
```

Sample values:

- `{{1}}` → Kwame
- `{{2}}` → 1,845.20
- `{{3}}` → TM-8F3K2L
- Button URL `{{1}}` → `app/bag`

Preview: _Hi Kwame, your payment of GH₵ 1,845.20 (ref TM-8F3K2L) wasn't completed in time, so nothing was charged. You can try again whenever you're ready._

### 12. `tomame_unpaid_cancelled` — Unpaid order / bag closed

| Field | Value |
|---|---|
| Name | `tomame_unpaid_cancelled` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | none |
| Button | Visit website — text **Shop again**, URL type **Dynamic**, URL `https://<production domain>/{{1}}` |

Body (paste exactly):

```
Hi {{1}}, we closed {{2}} because it wasn't paid within {{3}} hours. Nothing was charged. Paste the link again any time for a fresh quote.
```

Sample values:

- `{{1}}` → Akua
- `{{2}}` → your bag of 3 items
- `{{3}}` → 48
- Button URL `{{1}}` → `app/orders/new`

Preview: _Hi Akua, we closed your bag of 3 items because it wasn't paid within 48 hours. Nothing was charged. Paste the link again any time for a fresh quote._

### 13. `tomame_price_drop` — Price drop on a watch

| Field | Value |
|---|---|
| Name | `tomame_price_drop` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | none |
| Button | Visit website — text **See the price**, URL type **Dynamic**, URL `https://<production domain>/{{1}}` |

Body (paste exactly):

```
Hi {{1}}, good news: {{2}} has dropped {{3}}%. It now lands in Ghana for GH₵ {{4}}, shipping and fees included.
```

Sample values:

- `{{1}}` → Akua
- `{{2}}` → Sony WH-1000XM5 headphones
- `{{3}}` → 15
- `{{4}}` → 4,120.50
- Button URL `{{1}}` → `app/orders/new?url=https%3A%2F%2Fwww.amazon.com%2Fdp%2FB09XS7JWHH`

Preview: _Hi Akua, good news: Sony WH-1000XM5 headphones has dropped 15%. It now lands in Ghana for GH₵ 4,120.50, shipping and fees included._

### 14. `tomame_sourcing_available` — Sourcing answered: found

| Field | Value |
|---|---|
| Name | `tomame_sourcing_available` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | none |
| Button | Visit website — text **Open my bag**, URL type **Dynamic**, URL `https://<production domain>/{{1}}` |

Body (paste exactly):

```
Hi {{1}}, good news: our buyer found {{2}}. It's priced and waiting in your bag, so you can check out whenever you're ready.
```

Sample values:

- `{{1}}` → Efua
- `{{2}}` → Le Creuset 5.5 qt Dutch oven
- Button URL `{{1}}` → `app/bag`

Preview: _Hi Efua, good news: our buyer found Le Creuset 5.5 qt Dutch oven. It's priced and waiting in your bag, so you can check out whenever you're ready._

### 15. `tomame_sourcing_unavailable` — Sourcing answered: not available

| Field | Value |
|---|---|
| Name | `tomame_sourcing_unavailable` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | none |
| Button | Visit website — text **Open my bag**, URL type **Dynamic**, URL `https://<production domain>/{{1}}` |

Body (paste exactly):

```
Hi {{1}}, our buyer couldn't source {{2}} this time. Their note: {{3}}. Sorry about that. Your bag has been updated.
```

Sample values:

- `{{1}}` → Efua
- `{{2}}` → Le Creuset 5.5 qt Dutch oven
- `{{3}}` → sold out at every store that ships to us
- Button URL `{{1}}` → `app/bag`

Preview: _Hi Efua, our buyer couldn't source Le Creuset 5.5 qt Dutch oven this time. Their note: sold out at every store that ships to us. Sorry about that. Your bag has been updated._

### 16. `tomame_rider_assigned` — Delivery rider has your package

| Field | Value |
|---|---|
| Name | `tomame_rider_assigned` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | none |
| Button | Visit website — text **Track delivery**, URL type **Dynamic**, URL `https://<production domain>/{{1}}` |

Body (paste exactly):

```
Hi {{1}}, your delivery rider {{2}} has your package for {{3}} and is on the way. Rider's phone: {{4}}. Live tracking: {{5}}. See you soon!
```

Sample values:

- `{{1}}` → Kojo
- `{{2}}` → Emmanuel
- `{{3}}` → order TM-10482
- `{{4}}` → +233 24 412 3456
- `{{5}}` → https://m.uber.com/ul/?trip=abc123
- Button URL `{{1}}` → `app/orders/3f2a9c1e-7b4d-4e0a-9f61-2c8d5b7a1e90`

Preview: _Hi Kojo, your delivery rider Emmanuel has your package for order TM-10482 and is on the way. Rider's phone: +233 24 412 3456. Live tracking: https://m.uber.com/ul/?trip=abc123. See you soon!_

### 17. `tomame_quote_ready` — Pasted link priced (quote ready)

| Field | Value |
|---|---|
| Name | `tomame_quote_ready` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | none |
| Button | Visit website — text **See my quote**, URL type **Dynamic**, URL `https://<production domain>/{{1}}` |

Body (paste exactly):

```
Hi {{1}}, your quote for {{2}} is ready, priced in cedis with shipping included. Tap below to see it.
```

Sample values:

- `{{1}}` → Kojo
- `{{2}}` → KitchenAid Artisan stand mixer
- Button URL `{{1}}` → `app/orders/review/9d1e2f3a-4b5c-4d6e-8f70-1a2b3c4d5e6f`

Preview: _Hi Kojo, your quote for KitchenAid Artisan stand mixer is ready, priced in cedis with shipping included. Tap below to see it._

