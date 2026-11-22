-- 110: every paste records how it really ended (site brief, Fix 1).
--
-- `extraction_requests.status` only says whether the JOB finished: a read that
-- found no price still lands `ready`, so the admin queue counted failures as
-- "read" and the chat called a failed paste a "lapsed" quote. `outcome` is the
-- customer's answer, written once the job settles:
--   priced            — read and priced live
--   priced_from_cache — the live read failed; priced from the catalogue's last check
--   manual_quote      — no price; a buyer quotes it by hand (an assisted request)
--   priced_by_staff   — a buyer answered that manual quote with a price
--   unrecoverable     — a buyer closed it: we cannot get this item
-- `outcome_at` starts the 24-hour free-quote clock for a priced outcome. A
-- re-paste inside the 24 hours keeps the clock; it never extends a quote.
--
-- Paste-sourced assisted requests: a failed paste opens a buyer task by itself,
-- so `phone` may be empty (the buyer uses the account or the chat's number).

BEGIN;

ALTER TABLE extraction_requests
  ADD COLUMN IF NOT EXISTS outcome TEXT
    CHECK (outcome IN ('priced', 'priced_from_cache', 'manual_quote', 'priced_by_staff', 'unrecoverable')),
  ADD COLUMN IF NOT EXISTS outcome_at TIMESTAMPTZ;

COMMENT ON COLUMN extraction_requests.outcome IS
  '110: how the paste ended for the customer (not the job status). NULL while reading, and on rows settled before 110.';
COMMENT ON COLUMN extraction_requests.outcome_at IS
  '110: when the outcome was reached; for a priced outcome it starts the 24-hour free-quote clock.';

CREATE INDEX IF NOT EXISTS idx_extraction_requests_unsettled
  ON extraction_requests (finished_at)
  WHERE outcome IS NULL AND status IN ('ready', 'failed');

ALTER TABLE assisted_requests
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'customer'
    CHECK (source IN ('customer', 'paste'));
ALTER TABLE assisted_requests ALTER COLUMN phone DROP NOT NULL;

COMMENT ON COLUMN assisted_requests.source IS
  '110: customer = the Ask a buyer form; paste = opened automatically when a pasted link could not be priced.';

-- One open buyer task per pasted link.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_assisted_requests_open_paste
  ON assisted_requests (extraction_request_id)
  WHERE source = 'paste' AND status IN ('open', 'contacted') AND extraction_request_id IS NOT NULL;

-- Backfill only what is still provable: a finished paste whose stored read
-- carries a price was priced. Everything else stays NULL ("not recorded"):
-- old failures must not open buyer tasks weeks late.
UPDATE extraction_requests er
SET outcome = 'priced', outcome_at = coalesce(er.finished_at, er.updated_at)
FROM extraction_cache ec
WHERE er.extraction_cache_id = ec.id
  AND er.outcome IS NULL
  AND er.status = 'ready'
  AND jsonb_typeof(ec.result->'product'->'price') = 'number'
  AND (ec.result->'product'->>'price')::numeric > 0;

COMMIT;
