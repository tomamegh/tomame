import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { logger } from "@/lib/logger";
import { APIError } from "@/lib/auth/api-helpers";
import type { MessageResponse } from "@/types/api";
import { LoginSchemaType } from "../schema";
import { type AuthenticatedUser } from "../types";
import { PlatformUser } from "@/features/users/types";
import { JwtPayload, User } from "@supabase/supabase-js";

export async function signup(email: string, password: string): Promise<User> {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    if (
      error.status === 422 ||
      error.message.toLowerCase().includes("already registered")
    ) {
      throw new APIError(409, "Email already registered");
    }
    logger.error("Supabase signUp failed", { error: error.message });
    throw new APIError(500, "Registration failed");
  }

  if (!data.user) {
    throw new APIError(500, "Registration failed");
  }

  await logAuditEvent({
    actorId: data.user.id,
    actorRole: "user",
    action: "user_registered",
    entityType: "user",
    entityId: data.user.id,
  });

  return data.user;
}

export async function login(details: LoginSchemaType): Promise<PlatformUser> {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword(details);

  if (error) {
    throw new APIError(401, "Invalid email or password");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", data.user.id)
    .single();

  if (!profile) {
    throw new APIError(500, "User record not found");
  }

  await logAuditEvent({
    actorId: profile.id,
    actorRole: profile.role,
    action: "user_logged_in",
    entityType: "user",
    entityId: profile.id,
  });

  return { ...data.user, profile: profile as PlatformUser["profile"] };
}

/**
 * Send a password reset email.
 * Always returns success to prevent email enumeration.
 */
export async function forgotPassword(email: string): Promise<MessageResponse> {
  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/auth/reset-password`,
  });

  if (error) {
    logger.error("resetPasswordForEmail failed", { error: error.message });
  }

  const { data: userData } = await createAdminClient()
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (userData) {
    await logAuditEvent({
      actorId: userData.id,
      actorRole: "user",
      action: "password_reset_requested",
      entityType: "user",
      entityId: userData.id,
    });
  }

  return { message: "If an account exists, a reset link has been sent" };
}

export async function resetPassword(
  _userId: string,
  password: string,
): Promise<MessageResponse> {
  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    logger.error("Reset password failed", { error: error.message });
    throw new APIError(400, "Password reset failed");
  }

  return { message: "Password has been reset" };
}

export async function changePassword(
  _userId: string,
  newPassword: string,
): Promise<MessageResponse> {
  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    logger.error("Change password failed", { error: error.message });
    throw new APIError(400, "Password change failed");
  }

  return { message: "Password changed successfully" };
}

/**
 * Validates the current session and loads the user's authoritative role from DB.
 * Returns null if unauthenticated or if the user record is missing.
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createClient();

  const { data, error: userError } = await supabase.auth.getUser();

  if (!data.user || userError) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .single();

  if (!profile || error) return null;

  return {
    ...data.user,
    profile: {
      id: profile.id,
      role: profile.role,
      first_name: profile.first_name ?? undefined,
      last_name: profile.last_name ?? undefined,
      bio: profile.bio ?? undefined,
      created_at: new Date(profile.created_at),
      updated_at: new Date(profile.updated_at),
    },
  };
}

export async function getUserSession(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  session: JwtPayload;
  user: PlatformUser;
}> {
  const supabase = await createClient();

  const { data, error: userError } = await supabase.auth.getUser();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (!data.user || userError || !claimsData || claimsError)
    throw new APIError(401, "Unauthorized to perform this action");


  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .single();

  if (!profile || error) throw new APIError(401, "Unauthorized to perform this action");

  return {
    supabase,
    session: claimsData?.claims,
    user: {
      ...data.user,
    profile: {
      id: profile.id,
      role: profile.role,
      first_name: profile.first_name ?? undefined,
      last_name: profile.last_name ?? undefined,
      bio: profile.bio ?? undefined,
      created_at: new Date(profile.created_at),
      updated_at: new Date(profile.updated_at),
    },
    },
  };
}

export function canAccessAdmin(user: JwtPayload): boolean {
  if (!user || !user.email) return false;
  return (
    user.app_metadata?.role === "admin" && user.email.endsWith("@tomame.ca")
  );
}
