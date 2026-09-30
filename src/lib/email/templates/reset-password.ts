import { renderEmail, eyebrow, heading, paragraph, muted, button, fallbackLink } from "./layout";

export function resetPasswordTemplate(resetUrl: string) {
  return renderEmail("Reset your Tomame password", {
    preheader: "Choose a new password. The link works for 1 hour.",
    body: `
      ${eyebrow("Account security", "neutral")}
      ${heading("Reset your password")}
      ${paragraph("We got a request to reset the password on your Tomame account. Tap the button to choose a new one.")}
      ${button(resetUrl, "Choose a new password")}
      ${muted("This link works for 1 hour. If you did not ask for this, ignore this email and your password stays the same.")}
      ${fallbackLink(resetUrl)}
    `,
    reason: "You are getting this because someone asked to reset the password for this email address on Tomame.",
    manageLink: false,
  });
}
