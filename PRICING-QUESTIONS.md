# Pricing Model — Open Questions

All questions from the original pricing model PDF have been resolved in the updated PDF (March 2026) and implemented in the codebase.

## Resolved

1. **Seller Shipping** — Defaults to $0 when not detected. Displays as "FREE".
2. **Sales Tax** — Removed from the model entirely. Not a pricing component.
3. **Weight & Dimensions** — 3-step fallback: scrape → internet search → category default. Weight source logged per order.
4. **Fixed Freight Matching** — Combination of SKU/ASIN, keyword, and category matching.
5. **Quote Validity** — Pricing quote locked for 24 hours with FX rate at time of extraction.
6. **Service Fee Tiers** — Tiered model implemented (18%/15%/12%/10%/8% with $12 minimum).

## Remaining Work

- **Weight fallback Step 2** — Internet search via SerpAPI/Google Custom Search for product weight specs. Not yet implemented; currently falls through to category default.
