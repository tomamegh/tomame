-- Migration 053: contact_messages — somewhere for /contact to actually send to.
--
-- WHY. The contact form has never sent anything. `ContactForm`'s submit handler
-- was `form.handleSubmit(() => setSent(true))` — no fetch, no endpoint, no table
-- — and it then told the customer "Message sent! Thanks for reaching out. We'll
-- get back to you within a few hours." Every message anyone has ever typed into
-- that form was discarded on submit, while they were told the opposite.
--
-- ACCESS MODEL. Unlike almost everything else here there is no owner: a contact
-- message routinely comes from a signed-out visitor who has no account, and the
-- email they type is the only way back to them. So there is no owner-read policy
-- — admins read, and every write goes through the service role. `user_id` is
-- recorded when we happen to know it, for context, never for authorization.

CREATE TABLE IF NOT EXISTS contact_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Null for a signed-out sender, which is the common case. Context only.
  user_id      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  name         TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  email        TEXT NOT NULL CHECK (length(btrim(email)) > 0),
  subject      TEXT NOT NULL CHECK (length(btrim(subject)) > 0),
  message      TEXT NOT NULL CHECK (length(btrim(message)) > 0),
  status       TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'answered', 'closed')),
  handled_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  answered_at  TIMESTAMPTZ,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;
-- Explicit GRANTs: hosted Supabase grants these on new public tables by default
-- and a local `supabase start` does not, so stating them keeps the two identical
-- (migration 036 explains this at length).
GRANT SELECT ON contact_messages TO authenticated;
GRANT ALL ON contact_messages TO service_role;

CREATE POLICY "contact_messages admin read"
  ON contact_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- The queue's only ordering: oldest open first, because someone is waiting.
CREATE INDEX IF NOT EXISTS idx_contact_messages_queue
  ON contact_messages (status, created_at);
