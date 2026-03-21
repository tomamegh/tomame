-- Add minimum tax constant to pricing_constants table
INSERT INTO pricing_constants (key, value, description)
VALUES ('minimum_tax_usd', 12.00, 'Minimum tax per order (USD). Applied when the calculated tax % is below this amount.')
ON CONFLICT (key) DO NOTHING;
