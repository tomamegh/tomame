-- Drop unused pricing tables
-- pricing_config and pricing_constants are no longer used by the application.
-- Pricing is now handled via fixed_freight_items (category freight) and
-- weight-based formula with a static tax percentage.

DROP TABLE IF EXISTS pricing_constants;
DROP TABLE IF EXISTS pricing_config;
