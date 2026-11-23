import { renderEmail, eyebrow, heading, paragraph, muted, codeBox, escapeHtml } from "./layout";

/**
 * The emailed sign-in code (Seamless Roadmap, Initiative 1). The same code signs
 * in an existing account or creates a new one, so the copy says neither "welcome
 * back" nor "welcome": it says what to do with the code.
 */
export function signInCodeTemplate(code: string) {
  const safe = escapeHtml(code);
  return renderEmail(`${code} is your Tomame sign-in code`, {
    preheader: "Enter it in Tomame to carry on. It works for 1 hour.",
    body: `
      ${eyebrow("Sign in", "neutral")}
      ${heading("Your sign-in code")}
      ${paragraph("Enter this code in Tomame to sign in. If you are new, it creates your account too. No password needed.")}
      ${codeBox(safe)}
      ${muted("The code works for 1 hour, and only the newest code works. Never share it: Tomame will never ask you for it by phone or WhatsApp. If you did not ask for a code, ignore this email.")}
    `,
    reason: "You are getting this because someone asked for a Tomame sign-in code for this email address.",
    manageLink: false,
  });
}
