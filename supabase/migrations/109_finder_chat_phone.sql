-- 109: the customer's WhatsApp number on a chat. Phone is how Tomame reaches
-- customers, so the chat asks for a number, not an email. A visitor's number
-- lives here (E.164, +233…); a signed-in customer's goes on profiles.phone.
ALTER TABLE public.finder_chats ADD COLUMN IF NOT EXISTS phone TEXT;
