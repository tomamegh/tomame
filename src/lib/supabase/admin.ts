import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Creates a service-role Supabase client that bypasses RLS.
 * Only call this in:
 *   - Route handlers that need admin privilege (pass result to service)
 *   - System functions with no user session (webhooks, background jobs)
 * NEVER import this in client-side code — the "server-only" guard above
 * will cause a build error if you try.
 */
export function createAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

export const supabaseAdminClient = createAdminClient().auth.admin
