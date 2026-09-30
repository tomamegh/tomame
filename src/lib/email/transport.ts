import { Resend } from "resend";
import { htmlToText } from "./plain-text";

const resend = new Resend(process.env.RESEND_API_KEY || 'resend-api-key');

const fromAddress = process.env.RESEND_FROM_EMAIL ?? "Tomame <no-reply@tomame.com>";

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
  const { error } = await resend.emails.send({
    from: fromAddress,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text ?? htmlToText(opts.html),
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}
