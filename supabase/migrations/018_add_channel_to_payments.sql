-- Migration 018: Add channel column to payments table
-- Stores the payment channel returned by Paystack (e.g. card, mobile_money, bank, bank_transfer)

ALTER TABLE payments ADD COLUMN channel TEXT;

CREATE INDEX idx_payments_channel ON payments(channel);
