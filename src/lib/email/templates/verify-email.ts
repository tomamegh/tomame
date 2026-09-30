import { renderEmail, eyebrow, heading, paragraph, muted, button, fallbackLink } from "./layout";

export function verifyEmailTemplate(confirmUrl: string) {
  return renderEmail("Verify your Tomame account", {
    preheader: "One tap to confirm your email, then shop the world and pay in cedis.",
    body: `
      ${eyebrow("Welcome")}
      ${heading("Welcome to Tomame")}
      ${paragraph("Thanks for signing up. Confirm your email address and you are ready to shop from stores in the US, UK and China, priced in GH₵ and paid with Mobile Money or card.")}
      ${button(confirmUrl, "Confirm my email")}
      ${muted("This link works for 24 hours. If you did not create a Tomame account, you can ignore this email.")}
      ${fallbackLink(confirmUrl)}
    `,
    reason: "You are getting this because this email address was used to sign up on Tomame.",
    manageLink: false,
  });
}
