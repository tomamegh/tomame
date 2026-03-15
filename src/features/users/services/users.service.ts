import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { APIError } from "@/lib/auth/api-helpers";
import type { AuthenticatedUser } from "@/types/domain";
import type { AuthUserResponse } from "@/features/auth/types";
import type { MessageResponse } from "@/types/api";
import type { DbUser, DbOrder } from "@/types/db";
import type {
  AdminUser,
  UserListResponse,
  UserDetailResponse,
  UserRecentOrder,
} from "@/features/users/types";

// ── DB queries ────────────────────────────────────────────────────────────────

export async function getUserById(
  client: SupabaseClient,
  id: string
): Promise<DbUser | null> {
  const { data, error } = await client
    .from("users")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data as DbUser;
}

async function getUserByEmail(
  client: SupabaseClient,
  email: string
): Promise<DbUser | null> {
  const { data, error } = await client
    .from("users")
    .select("*")
    .eq("email", email)
    .single();

  if (error) return null;
  return data as DbUser;
}

async function insertUser(
  client: SupabaseClient,
  user: { id: string; email: string; role: "user" | "admin" }
): Promise<DbUser | null> {
  const { data, error } = await client
    .from("users")
    .insert(user)
    .select()
    .single();

  if (error) {
    logger.error("insertUser failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return null;
  }
  return data as DbUser;
}

async function updateUserRole(
  client: SupabaseClient,
  userId: string,
  role: "user" | "admin"
): Promise<DbUser | null> {
  const { data, error } = await client
    .from("users")
    .update({ role })
    .eq("id", userId)
    .select()
    .single();

  if (error) return null;
  return data as DbUser;
}

async function getAllUsers(
  client: SupabaseClient,
  filters?: { role?: string }
): Promise<{ users: AdminUser[]; count: number }> {
  const [authResult, rolesResult] = await Promise.all([
    client.auth.admin.listUsers({ perPage: 1000 }),
    client.from("users").select("id, role"),
  ]);

  if (authResult.error) {
    logger.error("getAllUsers (auth.admin.listUsers) failed", {
      error: authResult.error.message,
    });
    return { users: [], count: 0 };
  }

  const roleMap = new Map<string, "user" | "admin">(
    ((rolesResult.data ?? []) as { id: string; role: "user" | "admin" }[]).map(
      (u) => [u.id, u.role]
    )
  );

  let users: AdminUser[] = authResult.data.users.map((authUser) => ({
    id: authUser.id,
    email: authUser.email ?? "",
    role: roleMap.get(authUser.id) ?? "user",
    createdAt: authUser.created_at,
    lastSignInAt: authUser.last_sign_in_at ?? null,
    emailConfirmed: !!authUser.email_confirmed_at,
  }));

  users.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  if (filters?.role) {
    users = users.filter((u) => u.role === filters.role);
  }

  return { users, count: users.length };
}

async function getUserWithOrders(
  client: SupabaseClient,
  userId: string
): Promise<{ user: DbUser | null; orders: DbOrder[] }> {
  const [userResult, ordersResult] = await Promise.all([
    client.from("users").select("*").eq("id", userId).single(),
    client
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  return {
    user: userResult.error ? null : (userResult.data as DbUser),
    orders: ordersResult.error ? [] : (ordersResult.data as DbOrder[]),
  };
}

// ── Service functions ─────────────────────────────────────────────────────────

export async function promoteUserToAdmin(
  admin: AuthenticatedUser,
  targetUserId: string,
): Promise<AuthUserResponse> {
  const client = createAdminClient();

  const targetUser = await getUserById(client, targetUserId);
  if (!targetUser) {
    throw new APIError(404, "User not found");
  }

  if (targetUser.role === "admin") {
    throw new APIError(409, "User is already an admin");
  }

  const updated = await updateUserRole(client, targetUserId, "admin");
  if (!updated) {
    throw new APIError(500, "Failed to update role");
  }

  await logAuditEvent({
    actorId: admin.id,
    actorRole: "admin",
    action: "user_promoted_to_admin",
    entityType: "user",
    entityId: targetUserId,
    metadata: { previousRole: "user", newRole: "admin" },
  });

  return { id: updated.id, email: updated.email, role: updated.role };
}

export async function createAdminUser(
  admin: AuthenticatedUser,
  email: string,
  password: string,
): Promise<AuthUserResponse> {
  const client = createAdminClient();

  const existing = await getUserByEmail(client, email);
  if (existing) {
    throw new APIError(409, "Email already in use");
  }

  const { data: authData, error: authError } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    logger.error("Admin createUser failed", { error: authError.message });
    throw new APIError(500, "Failed to create user");
  }

  const newUserId = authData.user.id;

  const dbUser = await insertUser(client, { id: newUserId, email, role: "admin" });
  if (!dbUser) {
    await client.auth.admin.deleteUser(newUserId);
    throw new APIError(500, "Failed to create user record");
  }

  await logAuditEvent({
    actorId: admin.id,
    actorRole: "admin",
    action: "admin_user_created",
    entityType: "user",
    entityId: newUserId,
    metadata: { createdBy: admin.email, newAdminEmail: email },
  });

  return { id: dbUser.id, email: dbUser.email, role: dbUser.role };
}

export async function listUsers(
  client: SupabaseClient,
  _admin: AuthenticatedUser,
  filters?: { role?: string }
): Promise<UserListResponse> {
  const { users, count } = await getAllUsers(client, filters);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  return {
    users,
    count,
    stats: {
      total: count,
      admins: users.filter((u) => u.role === "admin").length,
      regularUsers: users.filter((u) => u.role === "user").length,
      newThisMonth: users.filter((u) => u.createdAt >= startOfMonth).length,
    },
  };
}

export async function getUserDetail(
  client: SupabaseClient,
  _admin: AuthenticatedUser,
  userId: string
): Promise<UserDetailResponse> {
  const [authResult, { user: dbUser, orders }] = await Promise.all([
    client.auth.admin.getUserById(userId),
    getUserWithOrders(client, userId),
  ]);

  if (authResult.error || !authResult.data.user) {
    throw new APIError(404, "User not found");
  }

  const authUser = authResult.data.user;
  const role = dbUser?.role ?? "user";

  const recentOrders: UserRecentOrder[] = orders.map((o) => ({
    id: o.id,
    productName: o.product_name,
    status: o.status as UserRecentOrder["status"],
    totalGhs: o.pricing?.total_ghs ?? 0,
    createdAt: o.created_at,
  }));

  return {
    user: {
      id: authUser.id,
      email: authUser.email ?? "",
      role,
      createdAt: authUser.created_at,
      lastSignInAt: authUser.last_sign_in_at ?? null,
      emailConfirmed: !!authUser.email_confirmed_at,
    },
    recentOrders,
  };
}

export async function createUser(
  admin: AuthenticatedUser,
  email: string,
  password: string,
  role: "user" | "admin"
): Promise<AdminUser> {
  const client = createAdminClient();

  const existing = await getUserByEmail(client, email);
  if (existing) throw new APIError(409, "Email already in use");

  const { data: authData, error: authError } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    logger.error("createUser (admin) failed", { error: authError.message });
    throw new APIError(500, "Failed to create user");
  }

  const newUserId = authData.user.id;
  const dbUser = await insertUser(client, { id: newUserId, email, role });

  if (!dbUser) {
    await client.auth.admin.deleteUser(newUserId);
    throw new APIError(500, "Failed to create user record");
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
    id: authData.user.id,
    email: authData.user.email ?? email,
    role,
    createdAt: authData.user.created_at,
    lastSignInAt: null,
    emailConfirmed: true,
  };
}

export async function updateUser(
  client: SupabaseClient,
  admin: AuthenticatedUser,
  userId: string,
  role: "user" | "admin"
): Promise<AdminUser> {
  const target = await getUserById(client, userId);
  if (!target) throw new APIError(404, "User not found");

  const makeUser = (u: typeof target, r: "user" | "admin"): AdminUser => ({
    id: u.id,
    email: u.email,
    role: r,
    createdAt: u.created_at,
    lastSignInAt: null,
    emailConfirmed: true,
  });

  if (target.role === role) {
    return makeUser(target, role);
  }

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

  return makeUser(updated, updated.role);
}

export async function adminResetUserPassword(
  admin: AuthenticatedUser,
  targetEmail: string,
): Promise<MessageResponse> {
  const client = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  const targetUser = await getUserByEmail(client, targetEmail);
  if (!targetUser) {
    throw new APIError(404, "User not found");
  }

  const { error } = await client.auth.resetPasswordForEmail(targetEmail, {
    redirectTo: `${appUrl}/auth/reset-password`,
  });

  if (error) {
    logger.error("Admin reset password failed", { error: error.message });
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
