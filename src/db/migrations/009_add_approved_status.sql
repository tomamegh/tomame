-- Migration 009: Add 'approved' status to orders
-- Adds admin approval step before payment: pending → approved → paid → ...
-- Run in Supabase SQL Editor

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
  status IN ('pending', 'approved', 'paid', 'processing', 'in_transit', 'delivered', 'completed', 'cancelled')
);
