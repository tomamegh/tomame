import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUserById } from "@/features/users/users.queries";
import type { AuthenticatedUser } from "@/types/domain";

/**
 * Validates the current session and loads the user's authoritative role from DB.
 * Returns null if unauthenticated or if the user record is missing.
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  // Use admin client to bypass RLS for the user lookup
  const dbUser = await getUserById(supabaseAdmin, authUser.id);
  if (!dbUser) return null;

  return {
    id: dbUser.id,
    email: dbUser.email,
    role: dbUser.role,
  };
}
