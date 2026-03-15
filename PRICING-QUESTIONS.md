# Pricing Model — Open Questions

Questions arising from the **Pricing Model for Tomame** PDF, compared against the current codebase implementation.

---

## 1. Seller Shipping (Method 2)

The formula includes "Seller Shipping (USD)" as a line item. Our scrapers don't currently extract shipping cost from product pages — most platforms only show shipping at checkout, not on the product page itself.

**Options:**
- Default to $0 and let admin override manually per order
- Add a configurable default shipping estimate per platform
- Leave it as a user-input field on the quote form

---

## 2. Sales Tax by State (Method 2)

The model requires knowing which US state the seller is in to apply the correct tax rate (0% for Oregon/Montana/Delaware/NH, up to 8.25% for others). Our scrapers don't extract seller location.

**Options:**
- Use a default rate (e.g. 6%) for all orders
- Make it an admin-configurable field per order
- Try to detect seller state from the product page (unreliable)

---

## 3. Weight & Dimensions for Freight (Method 2)

Freight calculation depends on actual weight and volumetric weight (L x W x H / 139). Our scrapers extract weight/dimensions from product specs when available, but many products don't list them.

**What's the fallback when weight/dimensions are missing?**
- Admin manually enters it after reviewing the product?
- Use a default weight estimate per category?
- Hold the quote until weight is confirmed?

---

## 4. Fixed Freight Database Matching (Method 1)

Method 1 says the system queries "Tomame's product database" to check if an item is recognised. The existing `static_price_list` table has `category` + `product_name` but no URL or SKU-based matching.

**How should matching work?**
- Match by product name / keyword?
- Match by category (e.g. all iPhones get a fixed rate)?
- Match by SKU / ASIN?
- Combination of the above?

---

## 5. Quote Validity (24 Hours)

The PDF states the quote is valid for 24 hours. Currently the extraction cache TTL is 5 hours, and there's no separate "quote" entity with its own locked-in pricing.

**Considerations:**
- Should the quote have its own TTL separate from the scrape cache?
- If the FX rate updates every 24 hours, the quote should lock the rate for 24 hours from generation
- Do we need a `quotes` table to persist generated quotes with their locked pricing?

---

## 6. Service Fee Tiers (Method 2)

The PDF defines a tiered service fee:

| Item Value   | Service Fee          |
|--------------|----------------------|
| Under $100   | 18% (minimum $12)    |
| $100 – $300  | 15%                  |
| $301 – $700  | 12%                  |
| $701 – $1,500| 10%                  |
| Above $1,500 | 8%                   |

The current `pricing_config` table uses a single `service_fee_percentage` per region.

**Should we replace the flat percentage with the tiered model from the PDF?**
