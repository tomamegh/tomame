import { Resend } from "resend";
import { env } from "@/lib/env";
import { htmlToText } from "./plain-text";

// Built on first send rather than at import, so a module that merely imports
// the transport (and a test that mocks it) never constructs a client. The key
// and sender come from `env`, which fails fast when either is missing: there
// is deliberately no placeholder key and no default sender domain.
let client: Resend | null = null;
function resend(): Resend {
  client ??= new Resend(env.email.resendApiKey);
  return client;
}

/**
 * Every message goes out as HTML plus a plain-text alternative. Callers that
 * pass a template's `text` send exactly that; the rest get it derived from the
 * HTML here, so no path can send an HTML-only email (which spam filters score
 * down and screen readers in text-mode clients cannot read).
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}) {
  const { error } = await resend().emails.send({
    from: env.email.fromAddress,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text ?? htmlToText(opts.html),
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}
