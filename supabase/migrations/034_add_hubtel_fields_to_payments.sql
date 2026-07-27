-- Migration 034: Hubtel Receive Money Prompt support on payments
--
-- The Hubtel prompt flow bills a specific mobile money wallet, so we record the
-- number that was charged and Hubtel's own transaction id for reconciliation
-- against the merchant portal.
--
-- `channel` (migration 018) now stores the Hubtel channel value —
-- 'mtn-gh' | 'vodafone-gh' | 'tigo-gh'.

ALTER TABLE payments ADD COLUMN customer_msisdn TEXT;
ALTER TABLE payments ADD COLUMN provider_transaction_id TEXT;

COMMENT ON COLUMN payments.customer_msisdn IS
  'Local 10-digit mobile money number that received the Hubtel PIN prompt.';
COMMENT ON COLUMN payments.provider_transaction_id IS
  'Hubtel TransactionId, for reconciliation against the merchant portal.';

CREATE INDEX idx_payments_provider_transaction_id
  ON payments(provider_transaction_id);
