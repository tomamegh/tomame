# WhatsApp templates (Meta Cloud API)

WhatsApp only delivers messages a business starts (every Tomame update) as
**pre-approved templates**. The set below is the whole of it; the code that
fills them is `src/lib/whatsapp/templates.ts`. The body text here and in that file
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

### Stage updates (WhatsApp & tracking brief, 2026-11-20) — submit these first

The brief's text, word for word; its `[first name]`, `[item name]`,
`[order ID]`, `[date]` and `[area / address]` are the placeholders. `{{1}}` is
always the first name; which fact fills `{{2}}` onwards differs per template
and is listed under each one (`STAGE_PARAMS` in the code).

Sending rules (from the brief):

- One message per stage, when the status actually changes. Every stage message
  is deduped per order and template (`whatsapp_stage:<order>:<template>`), so a
  status change and a package move cannot both send it, and landing plus the
  Accra warehouse send "cleared" once.
- No marketing in tracking messages.
- Send from **+233 59 442 4746**: that number is the WhatsApp sender, i.e. its
  Phone number ID is `WHATSAPP_PHONE_NUMBER_ID`.
- "Expected in Accra" is the order's delivery window end; when none is set,
  the departure date plus 5 days (the "In flight to Accra" stage's typical days).
- "Delivering to" is the area from the checkout snapshot (the address's area
  or city, else the delivery zone). With none at all the automated message is
  not the stage template: a generic `tomame_shipment_update` goes instead, and
  the admin button leaves `[area / address]` in the text for staff to fill.

Automated sends need the checkout tick ("Send me WhatsApp updates about my
order", 104); an unticked order gets none. A failed send for a ticked order is
flagged on the order for same-day manual follow-up. Until these are approved,
staff send each stage by hand from the admin order view ("Send WhatsApp" opens
wa.me with the same text filled in) and tick "WhatsApp sent".

| Internal stage | Template |
|---|---|
| paid | S1 `tomame_stage_paid` |
| purchased | S2 `tomame_stage_purchased` |
| hub_received | S3 `tomame_stage_us_hub` |
| departed | S4 `tomame_stage_in_flight` |
| arrived_country, ghana_warehouse | S5 `tomame_stage_accra_cleared` |
| out_for_delivery | S6a `tomame_stage_out_for_delivery` |
| delivered | S6b `tomame_stage_delivered` |
| ready_for_pickup | (none: `tomame_shipment_update`) |

### S1. `tomame_stage_paid` — Paid — order confirmed

| Field | Value |
|---|---|
| Name | `tomame_stage_paid` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | none |
| Button | Visit website — text **Track order**, URL type **Dynamic**, URL `https://<production domain>/{{1}}` |

Body (paste exactly; the line breaks are part of it):

```
Hi {{1}}, thank you for shopping with Tomame.
Payment received — your order is confirmed.
Item: {{2}}
Order: {{3}}
Expected delivery: 5–7 days from today.
We will message you here at every step. Track anytime: tomame.ca/track
— Tomame
```

Sample values:

- `{{1}}` (first name) → Ama
- `{{2}}` (item name) → Oraimo BoomPop N headphones
- `{{3}}` (order ID) → TM-00042
- Button URL `{{1}}` → `app/orders/3f2a9c1e-7b4d-4e0a-9f61-2c8d5b7a1e90`

Preview:

```
Hi Ama, thank you for shopping with Tomame.
Payment received — your order is confirmed.
Item: Oraimo BoomPop N headphones
Order: TM-00042
Expected delivery: 5–7 days from today.
We will message you here at every step. Track anytime: tomame.ca/track
— Tomame
```

### S2. `tomame_stage_purchased` — Purchased from the store

| Field | Value |
|---|---|
| Name | `tomame_stage_purchased` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | none |
| Button | Visit website — text **Track order**, URL type **Dynamic**, URL `https://<production domain>/{{1}}` |

Body (paste exactly; the line breaks are part of it):

```
Good news, {{1}} — we have purchased your item from the store.
Item: {{2}}
Order: {{3}}
Next step: delivery to our US hub.
Track anytime: tomame.ca/track
— Tomame
```

Sample values:

- `{{1}}` (first name) → Ama
- `{{2}}` (item name) → Oraimo BoomPop N headphones
- `{{3}}` (order ID) → TM-00042
- Button URL `{{1}}` → `app/orders/3f2a9c1e-7b4d-4e0a-9f61-2c8d5b7a1e90`

Preview:

```
Good news, Ama — we have purchased your item from the store.
Item: Oraimo BoomPop N headphones
Order: TM-00042
Next step: delivery to our US hub.
Track anytime: tomame.ca/track
— Tomame
```

### S3. `tomame_stage_us_hub` — Arrived at our US hub

| Field | Value |
|---|---|
| Name | `tomame_stage_us_hub` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | none |
| Button | Visit website — text **Track order**, URL type **Dynamic**, URL `https://<production domain>/{{1}}` |

Body (paste exactly; the line breaks are part of it):

```
Hi {{1}}, your item has arrived at our US hub and passed our check.
Item: {{2}}
Order: {{3}}
Next step: the flight to Accra.
Track anytime: tomame.ca/track
— Tomame
```

Sample values:

- `{{1}}` (first name) → Kofi
- `{{2}}` (item name) → Instant Pot Duo 7-in-1
- `{{3}}` (order ID) → TM-00042
- Button URL `{{1}}` → `app/orders/3f2a9c1e-7b4d-4e0a-9f61-2c8d5b7a1e90`

Preview:

```
Hi Kofi, your item has arrived at our US hub and passed our check.
Item: Instant Pot Duo 7-in-1
Order: TM-00042
Next step: the flight to Accra.
Track anytime: tomame.ca/track
— Tomame
```

### S4. `tomame_stage_in_flight` — In flight to Accra

| Field | Value |
|---|---|
| Name | `tomame_stage_in_flight` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | none |
| Button | Visit website — text **Track order**, URL type **Dynamic**, URL `https://<production domain>/{{1}}` |

Body (paste exactly; the line breaks are part of it):

```
Hi {{1}}, your box is on its way to Accra.
Order: {{2}}
Expected in Accra: {{3}}.
We will message you here as soon as it lands and clears.
— Tomame
```

Sample values:

- `{{1}}` (first name) → Kofi
- `{{2}}` (order ID) → TM-00042
- `{{3}}` (date) → Fri 21 Nov
- Button URL `{{1}}` → `app/orders/3f2a9c1e-7b4d-4e0a-9f61-2c8d5b7a1e90`

Preview:

```
Hi Kofi, your box is on its way to Accra.
Order: TM-00042
Expected in Accra: Fri 21 Nov.
We will message you here as soon as it lands and clears.
— Tomame
```

### S5. `tomame_stage_accra_cleared` — Arrived in Accra — cleared

| Field | Value |
|---|---|
| Name | `tomame_stage_accra_cleared` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | none |
| Button | Visit website — text **Track order**, URL type **Dynamic**, URL `https://<production domain>/{{1}}` |

Body (paste exactly; the line breaks are part of it):

```
Hi {{1}}, your box has landed in Accra and cleared.
Order: {{2}}
Next step: delivery to you. Please keep your phone close — we will confirm your delivery details with you here.
— Tomame
```

Sample values:

- `{{1}}` (first name) → Esi
- `{{2}}` (order ID) → TM-00042
- Button URL `{{1}}` → `app/orders/3f2a9c1e-7b4d-4e0a-9f61-2c8d5b7a1e90`

Preview:

```
Hi Esi, your box has landed in Accra and cleared.
Order: TM-00042
Next step: delivery to you. Please keep your phone close — we will confirm your delivery details with you here.
— Tomame
```

### S6a. `tomame_stage_out_for_delivery` — Out for delivery

| Field | Value |
|---|---|
| Name | `tomame_stage_out_for_delivery` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | none |
| Button | Visit website — text **Track order**, URL type **Dynamic**, URL `https://<production domain>/{{1}}` |

Body (paste exactly; the line breaks are part of it):

```
Hi {{1}}, your order is out for delivery today.
Order: {{2}}
Delivering to: {{3}}
Please be available to receive it. Questions? Reply here, or call us on +233 59 442 4746 (8am–10pm).
— Tomame
```

Sample values:

- `{{1}}` (first name) → Esi
- `{{2}}` (order ID) → TM-00042
- `{{3}}` (area / address) → East Legon
- Button URL `{{1}}` → `app/orders/3f2a9c1e-7b4d-4e0a-9f61-2c8d5b7a1e90`

Preview:

```
Hi Esi, your order is out for delivery today.
Order: TM-00042
Delivering to: East Legon
Please be available to receive it. Questions? Reply here, or call us on +233 59 442 4746 (8am–10pm).
— Tomame
```

### S6b. `tomame_stage_delivered` — Delivered

| Field | Value |
|---|---|
| Name | `tomame_stage_delivered` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | none |
| Button | Visit website — text **View order**, URL type **Dynamic**, URL `https://<production domain>/{{1}}` |

Body (paste exactly; the line breaks are part of it):

```
Delivered — thank you, {{1}}.
Order {{2}} was handed over today.
We hope you enjoy your {{3}}. If anything is wrong with it, reply here within 24 hours and we will help.
— Tomame
```

Sample values:

- `{{1}}` (first name) → Esi
- `{{2}}` (order ID) → TM-00042
- `{{3}}` (item name) → Sony WH-1000XM5 headphones
- Button URL `{{1}}` → `app/orders/3f2a9c1e-7b4d-4e0a-9f61-2c8d5b7a1e90`

Preview:

```
Delivered — thank you, Esi.
Order TM-00042 was handed over today.
We hope you enjoy your Sony WH-1000XM5 headphones. If anything is wrong with it, reply here within 24 hours and we will help.
— Tomame
```

### Everything else


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

### 3–6. Retired: `tomame_order_paid`, `tomame_order_processing`, `tomame_order_shipped`, `tomame_order_delivered`

Replaced on 2026-11-20 by the stage templates S1 (paid), S2 (purchased), S4
(in flight) and S6b (delivered) above. Nothing queues them any more; leave them
approved in Meta until no pending row names them, then delete them there.

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

### 18. `tomame_order_repriced` — Unpaid order / bag total changed

| Field | Value |
|---|---|
| Name | `tomame_order_repriced` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | none |
| Button | Visit website — text **Review and pay**, URL type **Dynamic**, URL `https://<production domain>/{{1}}` |

Body (paste exactly):

```
Hi {{1}}, we updated our shipping rates before you paid, so the total for {{2}} changed from GH₵ {{3}} to GH₵ {{4}}. Nothing has been charged. Tap below to review it.
```

Sample values:

- `{{1}}` → Ama
- `{{2}}` → your bag of 3 items
- `{{3}}` → 880.34
- `{{4}}` → 930.34
- Button URL `{{1}}` → `app/bag`

Preview: _Hi Ama, we updated our shipping rates before you paid, so the total for your bag of 3 items changed from GH₵ 880.34 to GH₵ 930.34. Nothing has been charged. Tap below to review it._

### 19. `tomame_shipment_update` — Parcel reached a new step (Ghana legs)

| Field | Value |
|---|---|
| Name | `tomame_shipment_update` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | none |
| Button | Visit website — text **Track order**, URL type **Dynamic**, URL `https://<production domain>/{{1}}` |

Body (paste exactly):

```
Hi {{1}}, an update on {{2}}: {{3}}. Your order page has the details and who to call if you need us.
```

Sample values:

- `{{1}}` → Ama
- `{{2}}` → order TM-10482
- `{{3}}` → Arrived in Ghana. Landed and clearing customs
- Button URL `{{1}}` → `app/orders/3f2a9c1e-7b4d-4e0a-9f61-2c8d5b7a1e90`

Preview: _Hi Ama, an update on order TM-10482: Arrived in Ghana. Landed and clearing customs. Your order page has the details and who to call if you need us._

### 20. `tomame_shipment_delay` — Parcel delayed

| Field | Value |
|---|---|
| Name | `tomame_shipment_delay` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | none |
| Button | Visit website — text **Track order**, URL type **Dynamic**, URL `https://<production domain>/{{1}}` |

Body (paste exactly):

```
Hi {{1}}, {{2}} is running late: {{3}}. Sorry for the wait. Your order page has the latest and who to call.
```

Sample values:

- `{{1}}` → Ama
- `{{2}}` → order TM-10482
- `{{3}}` → customs needs one more day, now expected Fri 14 Nov
- Button URL `{{1}}` → `app/orders/3f2a9c1e-7b4d-4e0a-9f61-2c8d5b7a1e90`

Preview: _Hi Ama, order TM-10482 is running late: customs needs one more day, now expected Fri 14 Nov. Sorry for the wait. Your order page has the latest and who to call._
