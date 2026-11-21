-- 107: the finder becomes a conversation.
--
-- A chat is the customer talking to the shopping assistant. Each assistant
-- turn may start one finder run (105) per item it understood ("an iPhone 17
-- Pro and a desktop monitor" is two runs), named in `run_ids`. The runs do the
-- searching and pricing exactly as before; the chat only holds the words.
--
-- One email per turn: when the last run a turn started settles, the turn is
-- claimed (`claim_finder_turn_email`) and one email names every item. A run
-- born in a chat sends no email of its own.
--
-- Owned like finder_runs: the signed-in user, or the `tm_quote_session`
-- cookie for a visitor, adopted on the next signed-in read. Server-only: RLS
-- on with no client policy; src/db/queries/finder-chats.ts filters by owner.

BEGIN;

CREATE TABLE IF NOT EXISTS finder_chats (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES profiles(id) ON DELETE CASCADE,
  session_id  TEXT,
  -- The first thing asked, shortened: the history list's line.
  title       TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  -- A visitor's typed address for results; an account's own is used otherwise.
  email       TEXT CHECK (email IS NULL OR (length(email) <= 254 AND email LIKE '%_@_%')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT finder_chats_one_owner CHECK ((user_id IS NULL) <> (session_id IS NULL))
);

CREATE TABLE IF NOT EXISTS finder_chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id     UUID NOT NULL REFERENCES finder_chats(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 4000),
  -- The finder runs this turn started (assistant turns only), in the order the items were named.
  run_ids     UUID[] NOT NULL DEFAULT '{}',
  -- The turn's one email, stamped by claim_finder_turn_email.
  emailed_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE finder_chats IS
  '107: shopping assistant conversations. Server-only (service role). The model never sets a price; every figure comes from the finder runs a turn started.';

CREATE INDEX IF NOT EXISTS idx_finder_chats_user ON finder_chats (user_id, updated_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_finder_chats_session ON finder_chats (session_id, updated_at DESC) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_finder_chat_messages_chat ON finder_chat_messages (chat_id, created_at);
-- "Which turn started this run": the email claim and the per-run email skip.
CREATE INDEX IF NOT EXISTS idx_finder_chat_messages_runs ON finder_chat_messages USING GIN (run_ids);

ALTER TABLE finder_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE finder_chat_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON finder_chats FROM anon, authenticated;
REVOKE ALL ON finder_chat_messages FROM anon, authenticated;
GRANT ALL ON finder_chats TO service_role;
GRANT ALL ON finder_chat_messages TO service_role;

-- Claim a turn's email once every run it started has settled. Returns the
-- message id when this caller won the claim, null otherwise (a run is still
-- working, or another worker already sent it). Atomic: two runs finishing
-- together cannot both send.
CREATE OR REPLACE FUNCTION claim_finder_turn_email(p_message_id UUID) RETURNS UUID AS $$
  UPDATE finder_chat_messages m
     SET emailed_at = now()
   WHERE m.id = p_message_id
     AND m.emailed_at IS NULL
     AND cardinality(m.run_ids) > 0
     AND NOT EXISTS (
       SELECT 1 FROM finder_runs r
        WHERE r.id = ANY (m.run_ids) AND r.status IN ('pending', 'running')
     )
  RETURNING m.id;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION claim_finder_turn_email(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_finder_turn_email(UUID) TO service_role;

COMMIT;
