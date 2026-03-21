import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { APIError } from "@/lib/auth/api-helpers";
import type { MessageResponse } from "@/types/api";
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

async function getUserByEmail(
  client: SupabaseClient,
  email: string,
): Promise<UserProfile | null> {
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("email", email)
    .single();

  if (error) return null;
  return data as UserProfile;
}

async function updateUserRole(
  client: SupabaseClient,
  userId: string,
  role: "user" | "admin",
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

  return { ...user, profile };
}

export async function createAdminUser(
  admin: PlatformUser,
  email: string,
  password: string,
): Promise<PlatformUser> {
  const client = createAdminClient();

  const existing = await getUserByEmail(client, email);
  if (existing) {
    throw new APIError(409, "Email already in use");
  }

  const { data, error: authError } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    logger.error("Admin createUser failed", { error: authError.message });
    throw new APIError(500, "Failed to create user");
  }

  const { data: profile, error } = await client
    .from("profiles")
    .select()
    .eq("id", data.user.id)
    .single();

    if(error) {
      throw new APIError(201, 'User was created but system failed to return the data')
    }

  await logAuditEvent({
    actorId: admin.id,
    actorRole: "admin",
    action: "admin_user_created",
    entityType: "user",
    entityId: data.user.id,
    metadata: { createdBy: admin.email, newAdminEmail: email },
  });

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
  role: "user" | "admin",
  first_name: string,
  last_name: string,
): Promise<PlatformUser> {
  const client = createAdminClient();

  const existing = await getUserByEmail(client, email);
  if (existing) throw new APIError(409, "Email already in use");

  const { data: authData, error: authError } =
    await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name, last_name },
    });

  if (authError) {
    logger.error("createUser (admin) failed", { error: authError.message });
    throw new APIError(500, "Failed to create user");
  }

  const newUserId = authData.user.id;

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
  role: "user" | "admin",
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
  }

  const result = await getUserById(client, userId);
  if (!result) throw new APIError(500, "Failed to fetch updated user");
  return result;
}

export async function adminResetUserPassword(
  admin: PlatformUser,
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
