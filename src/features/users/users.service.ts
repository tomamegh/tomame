import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUserById, getUserByEmail, updateUserRole, insertUser } from "@/features/users/users.queries";
import { logAuditEvent } from "@/features/audit/audit.service";
import { logger } from "@/lib/logger";
import type { AuthenticatedUser, ServiceResult } from "@/types/domain";
import type { AuthUserResponse, MessageResponse } from "@/types/api";

/**
 * Promote an existing user to admin.
 */
export async function promoteUserToAdmin(
  admin: AuthenticatedUser,
  targetUserId: string
): Promise<ServiceResult<AuthUserResponse>> {
  const targetUser = await getUserById(supabaseAdmin, targetUserId);

  if (!targetUser) {
    return { success: false, error: "User not found", status: 404 };
  }

  if (targetUser.role === "admin") {
    return { success: false, error: "User is already an admin", status: 409 };
  }

  const updated = await updateUserRole(supabaseAdmin, targetUserId, "admin");
  if (!updated) {
    return { success: false, error: "Failed to update role", status: 500 };
  }

  await logAuditEvent({
    actorId: admin.id,
    actorRole: "admin",
    action: "user_promoted_to_admin",
    entityType: "user",
    entityId: targetUserId,
    metadata: { previousRole: "user", newRole: "admin" },
  });

  return {
    success: true,
    data: { id: updated.id, email: updated.email, role: updated.role },
  };
}

/**
 * Create a brand-new admin user (auth + users table).
 */
export async function createAdminUser(
  admin: AuthenticatedUser,
  email: string,
  password: string
): Promise<ServiceResult<AuthUserResponse>> {
  // Check if email already exists
  const existing = await getUserByEmail(supabaseAdmin, email);
  if (existing) {
    return { success: false, error: "Email already in use", status: 409 };
  }

  // Create auth user with confirmed email
  const { data: authData, error: authError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authError) {
    logger.error("Admin createUser failed", { error: authError.message });
    return { success: false, error: "Failed to create user", status: 500 };
  }

  const newUserId = authData.user.id;

  const dbUser = await insertUser(supabaseAdmin, {
    id: newUserId,
    email,
    role: "admin",
  });

  if (!dbUser) {
    // Rollback auth user
    await supabaseAdmin.auth.admin.deleteUser(newUserId);
    return { success: false, error: "Failed to create user record", status: 500 };
  }

  await logAuditEvent({
    actorId: admin.id,
    actorRole: "admin",
    action: "admin_user_created",
    entityType: "user",
    entityId: newUserId,
    metadata: { createdBy: admin.email, newAdminEmail: email },
  });

  return {
    success: true,
    data: { id: dbUser.id, email: dbUser.email, role: dbUser.role },
  };
}

/**
 * Send a password reset email to any user (admin action).
 */
export async function adminResetUserPassword(
  admin: AuthenticatedUser,
  targetEmail: string
): Promise<ServiceResult<MessageResponse>> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  // Verify target user exists
  const targetUser = await getUserByEmail(supabaseAdmin, targetEmail);
  if (!targetUser) {
    return { success: false, error: "User not found", status: 404 };
  }

  const { error } = await supabaseAdmin.auth.resetPasswordForEmail(
    targetEmail,
    { redirectTo: `${appUrl}/auth/reset-password` }
  );

  if (error) {
    logger.error("Admin reset password failed", { error: error.message });
    return { success: false, error: "Failed to send reset email", status: 500 };
  }

  await logAuditEvent({
    actorId: admin.id,
    actorRole: "admin",
    action: "admin_password_reset_initiated",
    entityType: "user",
    entityId: targetUser.id,
    metadata: { targetEmail },
  });

  return {
    success: true,
    data: { message: "Password reset email sent" },
  };
}
