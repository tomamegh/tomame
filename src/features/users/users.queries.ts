import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbUser, DbOrder } from "@/types/db";
import type { AdminUser } from "@/features/users/types";
import { logger } from "@/lib/logger";

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

export async function getUserByEmail(
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

export async function insertUser(
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

export async function updateUserRole(
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

export async function getAllUsers(
  client: SupabaseClient,
  filters?: { role?: string }
): Promise<{ users: AdminUser[]; count: number }> {
  // Fetch all auth users (up to 1000) and our roles table in parallel
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

  console.log('Some error',authResult.data)

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

  // Sort newest first
  users.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  if (filters?.role) {
    users = users.filter((u) => u.role === filters.role);
  }

  return { users, count: users.length };
}

export async function getUserWithOrders(
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
