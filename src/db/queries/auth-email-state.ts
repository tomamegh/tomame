import type { SupabaseClient } from "@supabase/supabase-js";

/** 122. Whether an address has an account, and whether it is confirmed. Service-role client only. */
export interface AuthEmailState {
  userId: string;
  confirmed: boolean;
}

export async function selectAuthEmailState(admin: SupabaseClient, email: string): Promise<AuthEmailState | null> {
  const { data, error } = await admin.rpc("auth_email_state", { p_email: email });
  if (error) throw new Error(`auth_email_state failed: ${error.message}`);
  const row = (data as { user_id: string; confirmed: boolean }[] | null)?.[0];
  return row ? { userId: row.user_id, confirmed: row.confirmed } : null;
}
