import "server-only";

import type { User } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";

/** The `profiles` columns staff read and fill when buying for a customer. */
export interface CustomerProfileRow {
  id: string;
  role: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS = "id, role, first_name, last_name, phone, created_at, updated_at";

export async function getCustomerProfile(id: string): Promise<CustomerProfileRow | null> {
  const { data, error } = await createAdminClient().from("profiles").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Failed to load profile: ${error.message}`);
  return (data as CustomerProfileRow | null) ?? null;
}

export async function updateCustomerProfile(
  id: string,
  patch: Partial<Pick<CustomerProfileRow, "first_name" | "last_name" | "phone">> & { whatsapp_opt_in?: boolean },
): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  const { error } = await createAdminClient()
    .from("profiles")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Failed to update profile: ${error.message}`);
}

export async function getAuthUser(id: string): Promise<User | null> {
  const { data, error } = await createAdminClient().auth.admin.getUserById(id);
  if (error || !data.user) return null;
  return data.user;
}

/**
 * A sign-in account with a confirmed email and no password: the customer signs
 * in later with an emailed code. Null + `taken` when the email already exists.
 */
export async function createPasswordlessAccount(
  email: string,
  metadata: { first_name: string; last_name: string },
): Promise<{ user: User | null; taken: boolean; error: string | null }> {
  const { data, error } = await createAdminClient().auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error) {
    const taken = error.code === "email_exists" || error.code === "user_already_exists";
    return { user: null, taken, error: error.message };
  }
  return { user: data.user, taken: false, error: null };
}
