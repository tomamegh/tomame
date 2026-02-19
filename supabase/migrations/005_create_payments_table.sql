-- Migration 005: Create payments table + FK on orders.payment_id
-- Run in Supabase SQL Editor

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  reference TEXT UNIQUE NOT NULL,
  amount INTEGER NOT NULL,  -- pesewas (GHS × 100)
  currency TEXT NOT NULL DEFAULT 'GHS',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Users can read their own payments
CREATE POLICY "users can read own payments"
  ON payments FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can read all payments
CREATE POLICY "admins can read all payments"
  ON payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- No client-side INSERT/UPDATE/DELETE — all writes go through service-role client

-- Indexes
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_reference ON payments(reference);
CREATE INDEX idx_payments_status ON payments(status);

-- Add FK from orders.payment_id → payments.id
ALTER TABLE orders
  ADD CONSTRAINT orders_payment_id_fkey
  FOREIGN KEY (payment_id) REFERENCES payments(id);
