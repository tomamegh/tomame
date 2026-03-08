-- Migration 012: Create exchange_rates table
-- Stores cached exchange rates fetched from external provider (FreeCurrencyAPI).
-- Cron job updates these periodically; extraction preview reads from here.

CREATE TABLE exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency TEXT NOT NULL,
  target_currency TEXT NOT NULL DEFAULT 'GHS',
  rate DECIMAL(12, 6) NOT NULL,
  provider TEXT NOT NULL DEFAULT 'freecurrency',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(base_currency, target_currency)
);

ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;

-- Everyone can read exchange rates (public data)
CREATE POLICY "anyone can read exchange rates"
  ON exchange_rates FOR SELECT
  TO authenticated
  USING (true);

-- Only service role can insert/update (cron job uses admin client)
-- No explicit policy needed - service role bypasses RLS
