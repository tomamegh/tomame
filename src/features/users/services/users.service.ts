import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { APIError } from "@/lib/auth/api-helpers";
import { revokeUserSessions } from "@/db/queries/auth-sessions";
import type { MessageResponse } from "@/types/api";

/** The roles a person can be given by hand. `system` is a machine account. */
export type AssignableRole = "user" | "admin" | "warehouse";
import type { Order } from "@/features/orders/types";
import type {
  PlatformUser,
  UserProfile,
  UserListResponse,
  UserDetailResponse,
} from "@/features/users/types";

async function getProfileById(
  client: SupabaseClient,
  id: string,
): Promise<UserProfile | null> {
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data as UserProfile;
}

export async function getUserById(
  client: SupabaseClient,
  id: string,
): Promise<PlatformUser | null> {
  const [authResult, profileResult] = await Promise.all([
    client.auth.admin.getUserById(id),
    client.from("profiles").select("*").eq("id", id).single(),
  ]);

  if (authResult.error || !authResult.data.user) return null;

  const raw = profileResult.data;
  const profile: UserProfile = {
    id,
    role: raw?.role ?? "user",
    first_name: raw?.first_name ?? undefined,
    last_name: raw?.last_name ?? undefined,
    bio: raw?.bio ?? undefined,
    created_at: new Date(raw?.created_at ?? authResult.data.user.created_at),
    updated_at: new Date(
      raw?.updated_at ?? raw?.created_at ?? authResult.data.user.created_at,
    ),
  };

  return { ...authResult.data.user, profile };
}

/**
 * Auth owns email uniqueness (`profiles` has no email column), so a duplicate
 * is read off the createUser error rather than checked beforehand.
 */
function isEmailTaken(error: { code?: string }): boolean {
  // Codes only: auth answers 422 for a weak password too.
  return error.code === "email_exists" || error.code === "user_already_exists";
}

async function updateUserRole(
  client: SupabaseClient,
  userId: string,
  role: AssignableRole,
): Promise<UserProfile | null> {
  const { data, error } = await client
    .from("profiles")
    .update({ role })
    .eq("id", userId)
    .select()
    .single();

  if (error) return null;
  return data as UserProfile;
}

async function getAllUsers(
  client: SupabaseClient,
  filters?: { role?: string },
): Promise<{ users: PlatformUser[]; count: number }> {
  const [authResult, rolesResult] = await Promise.all([
    client.auth.admin.listUsers({ perPage: 1000 }),
    client.from("profiles").select("*"),
  ]);

  if (authResult.error) {
    logger.error("getAllUsers (auth.admin.listUsers) failed", {
      error: authResult.error.message,
    });
    return { users: [], count: 0 };
  }

  const profileMap = new Map<string, UserProfile>(
    ((rolesResult.data ?? []) as UserProfile[]).map((p) => [p.id, p]),
  );

  let users: PlatformUser[] = authResult.data.users.map((authUser) => {
    const profile = profileMap.get(authUser.id);
    return {
      ...authUser,
      profile: {
        id: authUser.id,
        role: profile?.role ?? "user",
        first_name: profile?.first_name ?? undefined,
        last_name: profile?.last_name ?? undefined,
        bio: profile?.bio ?? undefined,
        created_at: new Date(profile?.created_at ?? authUser.created_at),
        updated_at: new Date(
          profile?.updated_at ?? profile?.created_at ?? authUser.created_at,
        ),
      },
    };
  });

  users.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  if (filters?.role) {
    users = users.filter((u) => u.profile.role === filters.role);
  }

  return { users, count: users.length };
}

/**
 * End every session the user holds after a change to who they are (role) or
 * whether they may sign in (deactivation), so an open tab cannot keep acting
 * on the old answer. The change itself has already happened and been audited;
 * a failed revocation is logged, not thrown, because the ban and the role are
 * still enforced on the next token refresh.
 */
async function endSessionsAfterChange(userId: string, reason: string): Promise<void> {
  try {
    const ended = await revokeUserSessions(userId);
    logger.info("User sessions revoked", { userId, reason, ended });
  } catch (error: unknown) {
    logger.error("Revoking user sessions failed", {
      userId,
      reason,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ── Service functions ─────────────────────────────────────────────────────────

export async function promoteUserToAdmin(
  admin: PlatformUser,
  userId: string,
): Promise<PlatformUser> {
  const client = createAdminClient();

  const user = await getUserById(client, userId);

  if (!user) {
    throw new APIError(404, "User not found");
  }

  const profile = await getProfileById(client, userId);

  if (!profile || profile.role === "admin") {
    throw new APIError(409, "User is already an admin");
  }

  const updated = await updateUserRole(client, userId, "admin");
  if (!updated) {
    throw new APIError(500, "Failed to update role");
  }

  await logAuditEvent({
    actorId: admin.id,
    actorRole: "admin",
    action: "user_promoted_to_admin",
    entityType: "user",
    entityId: user.id,
    metadata: { previousRole: "user", newRole: "admin" },
  });
  await endSessionsAfterChange(userId, "role_changed");

  return { ...user, profile };
}

export async function createAdminUser(
  admin: PlatformUser,
  email: string,
  password: string,
): Promise<PlatformUser> {
  const client = createAdminClient();

  const { data, error: authError } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    if (isEmailTaken(authError)) throw new APIError(409, "Email already in use");
    logger.error("Admin createUser failed", { error: authError.message });
    throw new APIError(500, "Failed to create user");
  }

  // The account exists from here on, whatever the profile read below does, so
  // the audit row is written first: a failed read must not leave a created
  // account with no trail.
  await logAuditEvent({
    actorId: admin.id,
    actorRole: "admin",
    action: "admin_user_created",
    entityType: "user",
    entityId: data.user.id,
    metadata: { createdBy: admin.email, newAdminEmail: email },
  });

  const { data: profile, error } = await client
    .from("profiles")
    .select()
    .eq("id", data.user.id)
    .single();

  if (error) {
    logger.error("createAdminUser: profile read after create failed", {
      userId: data.user.id,
      code: error.code,
      message: error.message,
    });
    throw new APIError(500, "The account was created, but loading it failed. Refresh the users list.");
  }

  return { ...data.user, profile };
}

export async function listUsers(
  client: SupabaseClient,
  _admin: PlatformUser,
  filters?: { role?: string },
): Promise<UserListResponse> {
  const { users, count } = await getAllUsers(client, filters);

  const now = new Date();
  const startOfMonth = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
  ).toISOString();

  return {
    users,
    count,
    stats: {
      total: count,
      admins: users.filter((u) => u.profile.role === "admin").length,
      regularUsers: users.filter((u) => u.profile.role === "user").length,
      newThisMonth: users.filter((u) => u.created_at >= startOfMonth).length,
    },
  };
}

export async function getUserDetail(
  client: SupabaseClient,
  _admin: PlatformUser,
  userId: string,
): Promise<UserDetailResponse> {
  const [user, ordersResult] = await Promise.all([
    getUserById(client, userId),
    client
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (!user) throw new APIError(404, "User not found");

  return { user, recentOrders: ordersResult.data as Order[] };
}

export async function createUser(
  admin: PlatformUser,
  email: string,
  password: string,
  role: AssignableRole,
  first_name: string,
  last_name: string,
): Promise<PlatformUser> {
  const client = createAdminClient();

  const { data: authData, error: authError } =
    await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name, last_name },
    });

  if (authError) {
    if (isEmailTaken(authError)) throw new APIError(409, "Email already in use");
    logger.error("createUser (admin) failed", { error: authError.message });
    throw new APIError(500, "Failed to create user");
  }

  const newUserId = authData.user.id;

  // The signup trigger (061) always inserts 'user' — deliberately, since signup
  // metadata is client-writable. So the role chosen here must be written after
  // it, through the service role. This was missing: "create an admin" made a
  // customer and the response and audit row both claimed otherwise.
  if (role !== "user") {
    const granted = await updateUserRole(client, newUserId, role);
    if (!granted) {
      logger.error("createUser (admin) could not set role", { userId: newUserId, role });
      throw new APIError(500, "The account was created but its role could not be set. Set it from the user's page.");
    }
  }

  await logAuditEvent({
    actorId: admin.id,
    actorRole: "admin",
    action: "user_created",
    entityType: "user",
    entityId: newUserId,
    metadata: { createdBy: admin.email, email, role },
  });

  return {
    ...authData.user,
    profile: {
      id: newUserId,
      role,
      first_name,
      last_name,
      created_at: new Date(authData.user.created_at),
      updated_at: new Date(authData.user.created_at),
    },
  };
}

export async function updateUser(
  client: SupabaseClient,
  admin: PlatformUser,
  userId: string,
  role: AssignableRole,
): Promise<PlatformUser> {
  const target = await getProfileById(client, userId);
  if (!target) throw new APIError(404, "User not found");

  if (target.role !== role) {
    const updated = await updateUserRole(client, userId, role);
    if (!updated) throw new APIError(500, "Failed to update user");

    await logAuditEvent({
      actorId: admin.id,
      actorRole: "admin",
      action: "user_role_updated",
      entityType: "user",
      entityId: userId,
      metadata: { previousRole: target.role, newRole: role },
    });
    await endSessionsAfterChange(userId, "role_changed");
  }

  const result = await getUserById(client, userId);
  if (!result) throw new APIError(500, "Failed to fetch updated user");
  return result;
}

/**
 * Takes the user the route already resolved by id. It used to look them up
 * again by email on `profiles`, which has no email column, so every reset 404'd.
 */
export async function adminResetUserPassword(
  admin: PlatformUser,
  targetUser: PlatformUser,
): Promise<MessageResponse> {
  const client = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const targetEmail = targetUser.email;
  if (!targetEmail) throw new APIError(400, "This account has no email address");

  const { error } = await client.auth.resetPasswordForEmail(targetEmail, {
    redirectTo: `${appUrl}/auth/reset-password`,
  });

  if (error) {
    logger.error("Admin reset password failed", { error: error.message, _error: error });
    throw new APIError(500, "Failed to send reset email");
  }

  await logAuditEvent({
    actorId: admin.id,
    actorRole: "admin",
    action: "admin_password_reset_initiated",
    entityType: "user",
    entityId: targetUser.id,
    metadata: { targetEmail },
  });

  return { message: "Password reset email sent" };
}

/** Supabase has no permanent ban; a century is the documented stand-in. */
const DEACTIVATED_BAN = "876000h";

export function isUserDeactivated(user: Pick<PlatformUser, "banned_until">, now = new Date()): boolean {
  return !!user.banned_until && new Date(user.banned_until) > now;
}

/**
 * Deactivate or reactivate an account with an auth ban. A ban blocks sign-in
 * and token refresh; the account, its orders, payments and audit trail stay,
 * which is why there is no delete — `audit_logs` is append-only and a dozen
 * tables point at the user without a cascade. Deactivating also ends every
 * session they hold (`revoke_user_sessions`, 077), so an open tab is signed out
 * on its next request instead of keeping its access token for up to an hour.
 */
export async function setUserActive(
  admin: PlatformUser,
  userId: string,
  active: boolean,
): Promise<PlatformUser> {
  if (userId === admin.id) throw new APIError(400, "You cannot deactivate your own account");

  const client = createAdminClient();
  const target = await getUserById(client, userId);
  if (!target) throw new APIError(404, "User not found");
  // Machine accounts are not changed from the admin screens (see AdminRoleControl).
  if (target.profile.role === "system") throw new APIError(400, "System accounts cannot be deactivated");

  // Idempotent: asking for the state it is already in changes nothing and writes no audit row.
  if (isUserDeactivated(target) === !active) return target;

  const { error } = await client.auth.admin.updateUserById(userId, {
    ban_duration: active ? "none" : DEACTIVATED_BAN,
  });
  if (error) {
    logger.error("setUserActive failed", { userId, active, error: error.message });
    throw new APIError(500, active ? "Failed to reactivate the account" : "Failed to deactivate the account");
  }

  await logAuditEvent({
    actorId: admin.id,
    actorRole: "admin",
    action: active ? "user_reactivated" : "user_deactivated",
    entityType: "user",
    entityId: userId,
    metadata: { email: target.email ?? null, role: target.profile.role },
  });
  if (!active) await endSessionsAfterChange(userId, "deactivated");

  const updated = await getUserById(client, userId);
  if (!updated) throw new APIError(500, "Failed to fetch updated user");
  return updated;
}
