-- Migration 009: Seed default pricing config rows if not already present
-- Run in Supabase SQL Editor (idempotent — safe to re-run)

INSERT INTO pricing_config (region, base_shipping_fee_usd, exchange_rate, service_fee_percentage)
VALUES
  ('USA',   15.00, 14.50, 0.10),
  ('UK',    18.00, 18.00, 0.10),
  ('CHINA', 10.00, 14.50, 0.10)
ON CONFLICT (region) DO NOTHING;
