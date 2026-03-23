import { emailLayout, button, heading, paragraph, muted } from "./layout";

export function verifyEmailTemplate(confirmUrl: string) {
  return {
    subject: "Verify your Tomame account",
    html: emailLayout(`
      ${heading("Welcome to Tomame! 🎉")}
      ${paragraph("Thanks for signing up. Please verify your email address to get started with your account.")}
      ${button(confirmUrl, "Verify Email Address")}
      ${muted("If you didn't create this account, you can safely ignore this email. This link expires in 24 hours.")}
    `),
  };
}
