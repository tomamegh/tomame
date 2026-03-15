# Order Submission Process — Product Link to Checkout

## Overview

When a customer submits a product link, Tomame should extract as much product information as possible automatically to build user confidence and reduce errors. When extraction fails for any field, the customer is prompted to fill it in manually — and those orders are flagged for admin review.

---

## What We Extract From a Product Link

When a user pastes a URL, the system attempts to retrieve the following:

| Field | Source | Required | Auto-Extractable |
|---|---|---|---|
| Product Name | Page title / OG meta / structured data | Yes | Yes |
| Product Image | OG image / product image tag / structured data | No | Yes |
| Price (USD estimate) | Structured data / price tag / meta | Yes | Yes |
| Currency | Structured data / page content | Internal use | Yes |
| Origin Country | Derived from store domain (e.g. `amazon.com` = USA) | Yes | Yes |
| Availability | Structured data / stock indicator | Internal use | Yes |

### Data Sources (Priority Order)

For each supported store, the system tries these extraction methods in order:

1. **JSON-LD Structured Data** (`<script type="application/ld+json">`) — Most reliable. E-commerce sites embed `Product` schema with `name`, `image`, `offers.price`, `offers.priceCurrency`, `offers.availability`.
2. **Open Graph Meta Tags** (`og:title`, `og:image`, `og:price:amount`) — Widely supported fallback.
3. **Standard Meta Tags** (`<title>`, `<meta name="description">`) — Last resort for product name.
4. **Store-Specific Selectors** — CSS/DOM selectors tailored per store for price, name, and image when structured data is absent.

### Origin Country Auto-Detection

The origin country is derived directly from the store domain:

| Domain Pattern | Origin Country |
|---|---|
| `amazon.com`, `walmart.com`, `target.com`, `bestbuy.com`, `ebay.com` | USA |
| `amazon.co.uk`, `ebay.co.uk`, `asos.com` | UK |
| `aliexpress.com`, `alibaba.com`, `shein.com` | CHINA |

If a store's region mapping is ambiguous or not configured, the user selects it manually.

---

## The User Experience — Step by Step

### Step 1: Paste the Link

The customer pastes a product URL into the submission form. The system immediately:

1. **Validates the URL format** — Must be a valid `https://` URL.
2. **Checks the domain** — Must match an enabled store in the `supported_stores` table.
3. If the domain is not supported, the user sees:
   > "This store is not currently supported. Supported stores: Amazon, eBay, ..."

### Step 2: Auto-Fetch Product Details

Once the URL is accepted, the system shows a loading state and attempts extraction:

```
Fetching product details from amazon.com...
```

**If extraction succeeds** (all key fields retrieved):

The form auto-fills with a confirmation view:

```
+---------------------------------------------------------+
|  Product Details (auto-detected)                        |
+---------------------------------------------------------+
|                                                         |
|  [Product Image]                                        |
|                                                         |
|  Name:      Sony WH-1000XM5 Wireless Headphones        |
|  Price:     $348.00 (USD)                               |
|  Store:     Amazon US                                   |
|  Country:   USA (auto-detected)                         |
|                                                         |
|  [ ] This looks correct                                 |
|                                                         |
|  Quantity:  [1]                                         |
|  Special Instructions: [________________________]       |
|                                                         |
|  [Continue to Pricing]                                  |
+---------------------------------------------------------+
```

The customer confirms the details, sets quantity, adds instructions, and proceeds. The order is created as a **standard order** — no special admin review needed.

**If extraction partially fails** (some fields missing):

The form auto-fills what it can and highlights missing fields for the customer to complete:

```
+---------------------------------------------------------+
|  Product Details                                        |
+---------------------------------------------------------+
|                                                         |
|  [No image found]                                       |
|                                                         |
|  Name:      Sony WH-1000XM5 Wireless Headphones        |
|  Price:     Could not detect price                      |
|  Store:     Amazon US                                   |
|  Country:   USA (auto-detected)                         |
|                                                         |
|  !! We couldn't retrieve some details automatically.    |
|     Please fill in the missing fields below.            |
|                                                         |
|  Estimated Price (USD): [$_______] *                    |
|  Product Image URL:     [________________________]      |
|                                                         |
|  Quantity:  [1]                                         |
|  Special Instructions: [________________________]       |
|                                                         |
|  [Continue to Pricing]                                  |
+---------------------------------------------------------+
```

**If extraction completely fails** (e.g. page blocked, timeout, no data found):

The form falls back to full manual entry with clear guidance:

```
+---------------------------------------------------------+
|  Product Details                                        |
+---------------------------------------------------------+
|                                                         |
|  !! We couldn't automatically retrieve product details  |
|     from this link. Please provide them manually.       |
|                                                         |
|  Tip: Open the product page and copy the details below. |
|                                                         |
|  Product Name: [________________________] *             |
|  Estimated Price (USD): [$_______] *                    |
|  Product Image URL:     [________________________]      |
|  Origin Country: [USA / UK / CHINA] *                   |
|                                                         |
|  Quantity:  [1]                                         |
|  Special Instructions: [________________________]       |
|                                                         |
|  [Continue to Pricing]                                  |
+---------------------------------------------------------+
```

### Step 3: Confidence Indicators

Each field shows its source so users understand what was verified vs. what they need to double-check:

| Indicator | Meaning |
|---|---|
| **Auto-detected** | Retrieved from the product page. High confidence. |
| **User-provided** | Customer entered this manually. Needs admin verification. |
| **Confirmed** | Auto-detected and customer confirmed it's correct. |

---

## Needs Review — Flagging Orders for Admin Verification

### When Is an Order Flagged?

An order is marked as `needs_review = true` when **any** of these conditions are met:

| Condition | Reason |
|---|---|
| Price was manually entered by customer | Price could be inaccurate — admin must verify on the product page |
| Product name was manually entered | Could be incorrect or misleading |
| Extraction completely failed | Admin should verify the entire order against the product URL |
| Price was auto-detected but differs significantly from similar products | Possible extraction error or sale price vs. list price |

An order is **not** flagged when:
- All key fields (name, price) were auto-detected successfully
- The customer only provided optional fields (image, special instructions)
- Only quantity and special instructions were user-provided (these are always user-provided)

### What the Admin Sees

Orders flagged as `needs_review` appear in a dedicated admin section:

```
+---------------------------------------------------------+
|  Orders Needing Review                                  |
+---------------------------------------------------------+
|                                                         |
|  Order #042  |  amazon.com  |  GHS 1,240  |  REVIEW    |
|  -- Price was manually entered by customer              |
|  -- Product name was manually entered                   |
|                                                         |
|  Order #045  |  ebay.co.uk  |  GHS 890    |  REVIEW    |
|  -- Automatic extraction failed entirely                |
|                                                         |
+---------------------------------------------------------+
```

When an admin opens a flagged order, they see:

```
+---------------------------------------------------------+
|  Order #042 — Needs Review                              |
+---------------------------------------------------------+
|                                                         |
|  Product URL: https://amazon.com/dp/B09XS7JWHH         |
|  [Open Product Page ->]                                 |
|                                                         |
|  FIELD             | VALUE              | SOURCE        |
|  ------------------|--------------------|-----------    |
|  Product Name      | Wireless Headphones | User-provided |
|  Price (USD)       | $50.00             | User-provided |
|  Image             | (none provided)    | —             |
|  Origin Country    | USA                | Auto-detected |
|                    |                    |               |
|  Review Reasons:                                        |
|  - Price was manually entered by customer               |
|  - Product name was manually entered                    |
|                                                         |
|  Admin Actions:                                         |
|  [Approve Order]  [Edit & Approve]  [Reject Order]     |
|                                                         |
+---------------------------------------------------------+
```

### Admin Review Actions

| Action | What Happens |
|---|---|
| **Approve** | Clears the `needs_review` flag. Order proceeds normally. |
| **Edit & Approve** | Admin corrects fields (price, name, etc.), then approves. Changes are audit-logged. |
| **Reject** | Order is cancelled with a reason. Customer is notified and can resubmit. |

---

## Data Model Changes Required

### `orders` Table Additions

| Column | Type | Default | Purpose |
|---|---|---|---|
| `needs_review` | `BOOLEAN` | `false` | Flags orders for admin verification |
| `review_reasons` | `TEXT[]` | `{}` | Array of reasons the order was flagged |
| `reviewed_by` | `UUID` (FK -> users) | `null` | Admin who reviewed the order |
| `reviewed_at` | `TIMESTAMPTZ` | `null` | When the review was completed |
| `extraction_metadata` | `JSONB` | `null` | Raw extraction results for debugging |

### `extraction_metadata` Shape

```json
{
  "extraction_attempted": true,
  "extraction_success": true,
  "fields": {
    "name":    { "value": "Sony WH-1000XM5", "source": "json_ld", "confidence": "high" },
    "price":   { "value": 348.00, "source": "json_ld", "confidence": "high", "currency": "USD" },
    "image":   { "value": "https://...", "source": "og_meta", "confidence": "medium" },
    "country": { "value": "USA", "source": "domain_mapping", "confidence": "high" }
  },
  "errors": [],
  "fetched_at": "2026-02-27T10:30:00Z",
  "response_status": 200
}
```

### `review_reasons` Examples

```
["price_manual_entry", "name_manual_entry"]
["extraction_failed"]
["price_manual_entry"]
```

---

## Extraction Failure Scenarios

| Scenario | Behaviour | User Message |
|---|---|---|
| **Page returns 403/blocking** | Fall back to manual entry | "We couldn't access this product page. Please enter the details below." |
| **Page loads but no product data** | Fall back to manual entry | "We couldn't find product details on this page. Please enter them manually." |
| **Price found but in wrong currency** | Convert if possible, else ask user | "We found a price in GBP. Please confirm the USD equivalent." |
| **Multiple prices on page** | Use structured data price, else ask user | "We found multiple prices. Please confirm the correct price." |
| **Page timeout (>10s)** | Fall back to manual entry | "The product page took too long to respond. Please enter the details below." |
| **Image found but broken URL** | Skip image, don't block submission | Image field left empty — not a blocking issue |

---

## Order Creation Flow Summary

```
User pastes URL
    |
    v
Validate URL format + supported store domain
    |
    v
Attempt product data extraction  -----> Extraction succeeds (all fields)
    |                                        |
    |                                        v
    |                                   Pre-fill form, user confirms
    |                                        |
    |                                        v
    |                                   Create order (needs_review = false)
    |
    v
Extraction partially/fully fails
    |
    v
Show extracted fields + highlight missing
    |
    v
User fills in missing fields manually
    |
    v
Create order (needs_review = true, review_reasons = [...])
    |
    v
Order appears in admin "Needs Review" queue
    |
    v
Admin opens product URL, verifies details
    |
    v
Admin approves / edits+approves / rejects
```

---

## API Changes Summary

| Endpoint | Change |
|---|---|
| `POST /api/products/extract` | **New.** Accepts a product URL, returns extracted data. Called by the frontend before order creation. |
| `POST /api/orders` | Add `needs_review`, `review_reasons`, `extraction_metadata` to the request/creation logic. |
| `GET /api/admin/orders?needs_review=true` | Filter for orders needing review. |
| `POST /api/admin/orders/:id/review` | **New.** Admin approves, edits, or rejects a flagged order. |

---

## Key Principles

1. **Never block order submission** — If extraction fails, always fall back to manual entry. The customer should always be able to complete their order.
2. **Transparency** — Always show the customer where each piece of data came from (auto vs. manual).
3. **Trust but verify** — Manual entries are accepted immediately but flagged for admin review before the admin purchases the product.
4. **Fail gracefully** — Extraction errors are logged but never shown as scary error messages. Use friendly, helpful copy.
5. **Admin confidence** — The review screen gives admins everything they need: the original URL, what was extracted vs. entered, and clear action buttons.
