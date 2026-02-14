import nodemailer from "nodemailer";

const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "sandbox.smtp.mailtrap.io",
  port: Number(process.env.SMTP_PORT ?? 2525),
  auth: {
    user: process.env.SMTP_USER!,
    pass: process.env.SMTP_PASS!,
  },
});

const fromAddress =
  process.env.SMTP_FROM ?? "Tomame <no-reply@tomame.com>";

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}) {
  return transport.sendMail({
    from: fromAddress,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
}
