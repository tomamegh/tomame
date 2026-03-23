import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const fromAddress = process.env.RESEND_FROM_EMAIL ?? "Tomame <no-reply@tomame.com>";

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}) {
  const { error } = await resend.emails.send({
    from: fromAddress,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}
