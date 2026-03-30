import { emailLayout, button, heading, paragraph, muted } from "./layout";

export function resetPasswordTemplate(resetUrl: string) {
  return {
    subject: "Reset your Tomame password",
    html: emailLayout(`
      ${heading("Reset Your Password")}
      ${paragraph("We received a request to reset the password for your Tomame account. Click the button below to choose a new password.")}
      ${button(resetUrl, "Reset Password")}
      ${muted("If you didn't request a password reset, you can safely ignore this email. This link expires in 1 hour.")}
    `),
  };
}
