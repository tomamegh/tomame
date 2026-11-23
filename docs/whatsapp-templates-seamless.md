# WhatsApp templates — Seamless Roadmap drafts (for Meta submission)

Drafts for the Seamless Roadmap (2026-11-22): the quote reply, the six order
stages, the firm delivery date and the sign-in code. They sit beside
`docs/whatsapp-templates.md` (the 23 templates the code sends today) and do not
change any of those.

**Status: drafts, not yet in code.** `src/lib/whatsapp/templates.ts` does not
send any template in this file yet. When the piece that sends one is built, its
body moves into `docs/whatsapp-templates.md` and the code, character for
character, exactly like the existing set. Submitting early is still right:
Meta approval has its own lead time (roadmap p. 13).

## How to submit

Same steps as "Switching it on" in `docs/whatsapp-templates.md`:

- WhatsApp Manager → **Message templates → Create template**.
- Language **English (`en`)**, not `en_US`.
- Sender: **+233 59 442 4746**.
- Paste each body exactly. The line breaks are part of it.
- Button URLs use `https://tomame.ca/{{1}}`. The dynamic part is the path.

Meta rules these drafts already respect:

- No body starts or ends with a variable. Every body ends with "— Tomame".
- No two variables sit side by side.
- Every variable is on a labelled line.
- The code must never put a newline, a tab or more than four spaces inside a
  value, or the send fails with 132000.

## What to submit, at a glance

| # | Template | Category | Replaces / joins | Roadmap |
|---|---|---|---|---|
| A1 | `tomame_signin_code` | AUTHENTICATION | new | Init. 1: phone + WhatsApp sign-in |
| A2 | `tomame_quote_reply` | UTILITY | goes beside `tomame_quote_ready` (17) | Init. 1/4: quote in WhatsApp |
| A3 | `tomame_quote_checking` | UTILITY | new | Init. 4: the human-fallback reply |
| A4 | `tomame_stage_paid_v2` | UTILITY | replaces S1 `tomame_stage_paid` once approved | Init. 1/2: receipt + estimate |
| A5 | `tomame_stage_us_hub_photo` | UTILITY, image header | replaces S3 + `tomame_parcel_photo` at the hub | Init. 4: the hub photo |
| A6 | `tomame_stage_ready_for_pickup` | UTILITY | fills the gap (pickup has no stage template) | Init. 4: stage 6, pickup orders |
| A7 | `tomame_firm_date` | UTILITY | new | Init. 2 stage 2 / Init. 4 |
| A8 | `tomame_firm_date_changed` | UTILITY | new | Init. 2: the date moves |

Submit **A1 first**. Sign-in by phone cannot go live without it.

### The six stages: what is already drafted and what changes

The six stages already have templates, from the WhatsApp & tracking brief, word
for word. They are **not** redrafted here. Two stages change and one variant is
added:

| Roadmap stage | Template sent | Change |
|---|---|---|
| Paid | **A4** `tomame_stage_paid_v2` | S1 says "Expected delivery: 5–7 days from today". The roadmap needs a receipt (total paid), the estimate labelled as an estimate, and the Wed/Fri Delta Cargo explanation. |
| Purchased from the store | S2 `tomame_stage_purchased` | unchanged |
| Arrived at our US hub | **A5** `tomame_stage_us_hub_photo` (S3 when there is no photo yet) | The photo goes in the message itself, not a second "see photo" message. |
| In flight to Accra | S4 `tomame_stage_in_flight` | unchanged. Its "Expected in Accra" reads the firm date once **A7** has set one. |
| Arrived in Accra / cleared | S5 `tomame_stage_accra_cleared` | unchanged |
| Out for delivery / Delivered | S6a / S6b, plus **A6** for pickup orders | Pickup orders had no stage template. |

**Opt-out.** The roadmap asks for an opt-out in every automated sequence
(Initiative 4, item 4).
- The new automated templates (A4–A8) carry a footer: "Reply STOP to turn off
  these updates."
- **Do not send them until the STOP handler is built.** Today inbound messages
  are logged and not acted on (`src/lib/whatsapp/webhook.ts`).
- S2, S4, S5 and S6 can get the same footer by editing the approved template.
  The footer is separate from the body, so the brief's body text stays word for
  word.

---

## A1. `tomame_signin_code` — sign-in code

| Field | Value |
|---|---|
| Name | `tomame_signin_code` |
| Category | **AUTHENTICATION** |
| Language | English (`en`) |
| Code delivery | **Copy code** (button text: "Copy code") |
| Security recommendation | **On** ("For your security, do not share this code.") |
| Expiry footer | **On**, 10 minutes |

Meta writes the body of an authentication template itself. The only variable is
the code:

```
*{{1}}* is your verification code. For your security, do not share this code.
This code expires in 10 minutes.
```

- Sample: `{{1}}` → 482913
- The copy-code button repeats the code as its parameter.

Notes:

- Sent by Supabase's phone sign-in through its "Send SMS" hook. The hook posts to
  a Tomame route, and the route sends this template. Supabase's phone OTP expiry
  must be 600 s, so the footer is true.
- Authentication templates cannot carry links, emojis or marketing. Meta rejects
  any edit that adds them.

## A2. `tomame_quote_reply` — the quote, in the chat

The reply when a customer pastes a store link in WhatsApp (Initiative 4, item
2), or asks for a site quote in WhatsApp.

- When the customer wrote first, Tomame is inside WhatsApp's 24-hour
  customer-service window. A free-form reply with this same text would work, and
  a utility template sent in that window is free.
- The template is still worth having: one wording everywhere, and it still sends
  if the price arrives after the window has closed.

| Field | Value |
|---|---|
| Name | `tomame_quote_reply` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | none |
| Button 1 | Visit website — text **Pay now**, URL type **Dynamic**, URL `https://tomame.ca/{{1}}` |
| Button 2 | Quick reply — text **Ask a person** |

Body (paste exactly):

```
Hi {{1}}, here is your Tomame quote.
Item: {{2}}
Item price: {{3}}
Sales tax: {{4}}
Tomame fee – 4% flat: {{5}}
Store shipping: {{6}}
Rate used: {{7}}
Freight, incl. customs & clearance: {{8}}
Customs & clearance: GH₵0 extra on delivery
Total to pay: {{9}}
Delivery estimate: {{10}}. Your item flies on the next Wednesday or Friday Delta Cargo flight, JFK to Accra, after it reaches our US hub.
Free quote – pay by {{11}} or this quote will be cancelled.
— Tomame
```

Sample values (at the review rate, $1 = GH₵12.28, AirPods Pro 3 at $179.99 =
GH₵2,693.21):

- `{{1}}` (first name; the WhatsApp profile name when there is no account) → Ama
- `{{2}}` (item, store) → Apple AirPods Pro 3 (Amazon)
- `{{3}}` → $179.99
- `{{4}}` → $11.70
- `{{5}}` → $7.20
- `{{6}}` → none
- `{{7}}` → $1 = GH₵12.28
- `{{8}}` → GH₵250.84
- `{{9}}` → GH₵2,693.21
- `{{10}}` → usually 5–7 days
- `{{11}}` → 3:40 pm tomorrow, Sun 23 Nov
- Button URL `{{1}}` → `app/orders/review/9d1e2f3a-4b5c-4d6e-8f70-1a2b3c4d5e6f`

Notes:

- The labels match the site's breakdown (`src/config/price-story.ts`). Item,
  tax, fee and store shipping are in the listing currency, freight and total in
  cedis, as on the bag.
- "4% flat" is fixed text, because the base is fixed. If the fee ever changes,
  this template is resubmitted with it (`price-story.ts` computes the label on
  the site).
- `{{11}}` is the same expiry the quote page shows (brief Fix 1.6). Both must
  read one clock.
- "Pay now" opens the Phase 1 one-screen flow with this quote loaded.
- "Ask a person" hands the chat to staff.

## A3. `tomame_quote_checking` — when the link cannot be priced automatically

The human-fallback reply (brief Fix 1.3, roadmap Initiative 4 acceptance test 1).

| Field | Value |
|---|---|
| Name | `tomame_quote_checking` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | none |
| Button | Quick reply — text **Ask a person** |

Body (paste exactly):

```
Hi {{1}}, we could not price {{2}} automatically, so a member of our team is checking it now.
We will send your quote here within {{3}}. Nothing is charged until you see the price and choose to pay.
— Tomame
```

Sample values:

- `{{1}}` → Kojo
- `{{2}}` → this Walmart item
- `{{3}}` → 2 hours

Note: `{{3}}` is the staff-task promise from brief Fix 1.3. It must be the real
figure, not a hope.

## A4. `tomame_stage_paid_v2` — Paid: receipt and estimate

Replaces S1 `tomame_stage_paid` once approved. The roadmap needs "receipt, TM-
order number, total paid, and the estimated delivery range" in one message
(Initiative 1), with the range labelled as an estimate (Initiative 2, stage 1).

| Field | Value |
|---|---|
| Name | `tomame_stage_paid_v2` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | Reply STOP to turn off these updates |
| Button | Visit website — text **Track order**, URL type **Dynamic**, URL `https://tomame.ca/{{1}}` |

Body (paste exactly):

```
Hi {{1}}, thank you for shopping with Tomame.
Payment received – your order is confirmed.
Order: {{2}}
Item: {{3}}
Total paid: {{4}}
Paid with: {{5}}
Receipt: {{6}}
Estimated delivery: {{7}}. Your item flies on the next Wednesday or Friday Delta Cargo flight, JFK to Accra, after it reaches our US hub. We will send your firm delivery date here once the store has shipped it to us.
— Tomame
```

Sample values:

- `{{1}}` → Ama
- `{{2}}` → TM-00042
- `{{3}}` → Oraimo BoomPop N headphones
- `{{4}}` → GH₵802.99
- `{{5}}` → MTN Mobile Money
- `{{6}}` (Paystack reference) → TMG-8F2KQ1
- `{{7}}` → usually 5–7 days
- Button URL `{{1}}` → `app/orders/3f2a9c1e-7b4d-4e0a-9f61-2c8d5b7a1e90`

Note: the Wed/Fri sentence is true only once brief Fix 9 (the Wed/Fri Delta
Cargo departures) is live. Until then, keep sending S1.

## A5. `tomame_stage_us_hub_photo` — Arrived at our US hub, with the photo

| Field | Value |
|---|---|
| Name | `tomame_stage_us_hub_photo` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | **Image** (upload any parcel photo as the sample) |
| Footer | Reply STOP to turn off these updates |
| Button | Visit website — text **Track order**, URL type **Dynamic**, URL `https://tomame.ca/{{1}}` |

Body (paste exactly):

```
Hi {{1}}, your item has arrived at our US hub and passed our check. This is the photo we took of it.
Item: {{2}}
Order: {{3}}
Next step: the next Wednesday or Friday Delta Cargo flight, JFK to Accra.
— Tomame
```

Sample values:

- Header image → a hub parcel photo (JPEG or PNG, ≤ 5 MB)
- `{{1}}` → Kofi
- `{{2}}` → Instant Pot Duo 7-in-1
- `{{3}}` → TM-00042
- Button URL `{{1}}` → `app/orders/3f2a9c1e-7b4d-4e0a-9f61-2c8d5b7a1e90`

Notes:

- The header image is sent as a link Meta fetches at send time: a short-lived
  signed URL to the photo in storage (`order_photos`, migration 054).
- When the hub stage fires before a photo exists, S3 goes instead and no second
  message follows. A hub photo then no longer sends `tomame_parcel_photo` for
  the same order.

## A6. `tomame_stage_ready_for_pickup` — ready for pickup (stage 6, pickup orders)

| Field | Value |
|---|---|
| Name | `tomame_stage_ready_for_pickup` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | Reply STOP to turn off these updates |
| Button | Visit website — text **View order**, URL type **Dynamic**, URL `https://tomame.ca/{{1}}` |

Body (paste exactly):

```
Hi {{1}}, your order is ready for pickup.
Order: {{2}}
Pick up at: {{3}}
Show this message when you collect it. Questions? Reply here, or call us on +233 59 442 4746 (8am–10pm).
— Tomame
```

Sample values:

- `{{1}}` → Esi
- `{{2}}` → TM-00042
- `{{3}}` → Tomame office, No. 4 Old Bortianor, Nii Attram Mensah St, Accra, near West Hills Mall
- Button URL `{{1}}` → `app/orders/3f2a9c1e-7b4d-4e0a-9f61-2c8d5b7a1e90`

Note: `{{3}}` comes from the pickup point on the order (its delivery zone), not
fixed text, so a second pickup point needs no new template.

## A7. `tomame_firm_date` — the firm date, once the store tracking is in

Initiative 2, stage 2. Sent once, when store tracking with a hub-arrival date is
recorded (brief Fix 12) and the next Wed/Fri flight is locked to the order.

| Field | Value |
|---|---|
| Name | `tomame_firm_date` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | Reply STOP to turn off these updates |
| Button | Visit website — text **Track order**, URL type **Dynamic**, URL `https://tomame.ca/{{1}}` |

Body (paste exactly):

```
Hi {{1}}, the store has shipped your item, so your delivery date is now firm.
Order: {{2}}
Arrives at our US hub: {{3}}
Flight: Delta Cargo, JFK to Accra, {{4}}
Delivery date: {{5}}
If anything moves, we will tell you here before this date.
— Tomame
```

Sample values:

- `{{1}}` → Ama
- `{{2}}` → TM-00042
- `{{3}}` → Mon 24 Nov
- `{{4}}` → Wed 26 Nov
- `{{5}}` → Mon 1 Dec
- Button URL `{{1}}` → `app/orders/3f2a9c1e-7b4d-4e0a-9f61-2c8d5b7a1e90`

## A8. `tomame_firm_date_changed` — the firm date moved

Initiative 2: "If store tracking slips or a flight moves, the firm date is
recalculated and the customer is told before the old date passes."

| Field | Value |
|---|---|
| Name | `tomame_firm_date_changed` |
| Category | UTILITY |
| Language | English (`en`) |
| Header | none |
| Footer | Reply STOP to turn off these updates |
| Button | Visit website — text **Track order**, URL type **Dynamic**, URL `https://tomame.ca/{{1}}` |

Body (paste exactly):

```
Hi {{1}}, your delivery date has changed because {{2}}.
Order: {{3}}
New flight: Delta Cargo, JFK to Accra, {{4}}
New delivery date: {{5}}, was {{6}}.
We are sorry for the wait. Questions? Reply here, or call us on +233 59 442 4746 (8am–10pm).
— Tomame
```

Sample values:

- `{{1}}` → Ama
- `{{2}}` → the store shipped later than planned
- `{{3}}` → TM-00042
- `{{4}}` → Fri 28 Nov
- `{{5}}` → Wed 3 Dec
- `{{6}}` → Mon 1 Dec
- Button URL `{{1}}` → `app/orders/3f2a9c1e-7b4d-4e0a-9f61-2c8d5b7a1e90`

Note: `{{2}}` is one of two fixed phrases chosen by the code: "the store shipped
later than planned" or "the flight was moved". It is never free text typed by
staff, because a template value must stay inside what Meta approved.

---

## Not templates, but part of the same journey

- **Greeting with support hours** (Initiative 4). Set it in WhatsApp Manager →
  Business profile / greeting message, not as a template:

  ```
  Hi, welcome to Tomame. Paste any US store link here and we will price it in cedis. Our team replies 8am–10pm.
  ```

- **Order context in "Chat on WhatsApp" links.** These are `wa.me` links with
  the text already filled in, built on the site; they are not templates.
  `journey-progress-card.tsx` already includes the order number and stage.
