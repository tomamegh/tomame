import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbUser } from "@/types/db";
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
