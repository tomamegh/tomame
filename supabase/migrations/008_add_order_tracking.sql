-- Migration 008: Add order tracking columns and expand status lifecycle
-- Adds in_transit and delivered statuses, plus tracking fields for shipment info.

-- 1. Drop the existing status CHECK constraint and recreate with new statuses
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
  status IN ('pending', 'paid', 'processing', 'in_transit', 'delivered', 'completed', 'cancelled')
);

-- 2. Add tracking columns
ALTER TABLE orders
  ADD COLUMN tracking_number TEXT,
  ADD COLUMN carrier TEXT,
  ADD COLUMN estimated_delivery_date DATE,
  ADD COLUMN delivered_at TIMESTAMPTZ;
