import "server-only";

import { randomBytes } from "node:crypto";

import { logAuditEvent } from "@/features/audit/services/audit.service";
import { APIError } from "@/lib/auth/api-helpers";
import { sendEmail } from "@/lib/email/transport";
import { signInCodeTemplate } from "@/lib/email/templates/sign-in-code";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { selectAuthEmailState } from "@/db/queries/auth-email-state";

/**
 * Email-code sign-in (Seamless Roadmap, Initiative 1; WhatsApp joins it when
 * the Meta key arrives). One code signs in an existing account or creates a new
 * one, so a first-time customer at Pay never has to invent a password.
 *
 * The code is Supabase's own one-time password, minted with `generateLink`
 * (which sends nothing) and emailed by us through Resend, so it carries our
 * template and is not held to the Supabase project's hourly email limit.
 * Verification is Supabase's `verifyOtp`, which also confirms a new address.
 */

/** Every address gets a code (a new one gets an account), so the answer never says who already has one. */
export const EMAIL_CODE_SENT = "We've emailed you a code.";

export async function sendEmailSignInCode(email: string): Promise<{ message: string }> {
  // `magiclink` on an address with no account creates it, unconfirmed, and
  // hands back a signup code; on an existing account, a sign-in code. Each new
  // code replaces the last.
  const { data, error } = await createAdminClient().auth.admin.generateLink({ type: "magiclink", email });
  const code = data?.properties?.email_otp;
  if (error || !code) {
    logger.error("email-code: generateLink failed", { code: error?.code, message: error?.message ?? "no email_otp" });
    throw new APIError(503, "We couldn't send a code just now. Please try again in a minute.");
  }

  const mail = signInCodeTemplate(code);
  try {
    await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
  } catch (err) {
    logger.error("email-code: send failed", { error: err instanceof Error ? err.message : String(err) });
    throw new APIError(503, "We couldn't send a code just now. Please try again in a minute.");
  }
  return { message: EMAIL_CODE_SENT };
}

export async function verifyEmailSignInCode(email: string, code: string): Promise<{ isNew: boolean }> {
  const admin = createAdminClient();
  // Read before the code is spent: afterwards every account looks confirmed.
  const before = await selectAuthEmailState(admin, email).catch((err: unknown) => {
    logger.error("email-code: auth_email_state failed", { error: err instanceof Error ? err.message : String(err) });
    throw new APIError(503, "We couldn't check the code just now. Please try again in a minute.");
  });

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });

  if (error || !data.user) {
    if (error?.code === "user_banned") {
      throw new APIError(403, "This account has been deactivated. Contact support to restore it.");
    }
    // Supabase answers `otp_expired` for a wrong code as well as an old one.
    if (error?.code === "otp_expired") {
      throw new APIError(400, "That code isn't right, or it has expired. Check the newest email from Tomame, or ask for a new code.");
    }
    if (error && error.status !== undefined && error.status >= 500) {
      logger.error("email-code: verifyOtp failed", { code: error.code, message: error.message });
      throw new APIError(503, "We couldn't check the code just now. Please try again in a minute.");
    }
    throw new APIError(400, "That code isn't right. Check the latest email from Tomame and try again.");
  }

  const user = data.user;
  // Confirmed by this code: a new account, or one registered and never confirmed.
  const isNew = !before || !before.confirmed;

  if (before && !before.confirmed) {
    await secureJustConfirmedAccount(admin, supabase, user.id, email);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();
  // The code was right; a failure from here is ours. Drop the half-made session
  // so the customer starts clean, as the password sign-in does.
  if (profileError || !profile) {
    logger.error("email-code: profile read failed", { code: profileError?.code ?? "no_profile", message: profileError?.message });
    await supabase.auth.signOut().catch(() => undefined);
    throw new APIError(503, "We couldn't finish signing you in because of a problem on our side. Please try again in a minute.");
  }

  await logAuditEvent({
    actorId: profile.id,
    actorRole: profile.role,
    action: isNew ? "user_registered" : "user_logged_in",
    entityType: "user",
    entityId: profile.id,
    metadata: { method: "email_code" },
  });
  return { isNew };
}

/**
 * An address someone registered with a password and never confirmed has just
 * been proven by its owner. Whoever chose that password must not keep a way in
 * (account pre-hijacking), so it is replaced with one nobody knows; the owner
 * can set their own from "Forgot password". Harmless for an account the code
 * itself created, which never had a password.
 *
 * Supabase signs out every session when a password changes, the one this code
 * just made included, so a fresh session is minted and verified here, straight
 * into the same cookies.
 */
async function secureJustConfirmedAccount(
  admin: ReturnType<typeof createAdminClient>,
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  email: string,
): Promise<void> {
  const { error: rotateError } = await admin.auth.admin.updateUserById(userId, {
    password: randomBytes(32).toString("base64url"),
  });
  if (rotateError) {
    // The session from the code still stands; only the old password does too.
    logger.error("email-code: password rotate failed", { message: rotateError.message });
    return;
  }
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  const { error: sessionError } = tokenHash
    ? await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash })
    : { error: linkError ?? new Error("no hashed_token") };
  if (sessionError) {
    logger.error("email-code: re-session failed", { message: sessionError.message });
    throw new APIError(503, "Your email is confirmed, but we couldn't finish signing you in. Ask for a new code to sign in.");
  }
}
