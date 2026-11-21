-- 108: links pasted into the shopping assistant (107) are read in the chat.
--
-- Buy for me and the assistant are one screen now: a pasted link is queued on
-- the paste queue (049) exactly as before, and the turn that queued it names
-- it here, so the thread can show it reading and priced where it was pasted.

BEGIN;

ALTER TABLE finder_chat_messages
  ADD COLUMN IF NOT EXISTS paste_ids UUID[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN finder_chat_messages.paste_ids IS
  '108: extraction_requests rows this turn queued from links in the customer''s message, in the order pasted.';

COMMIT;
