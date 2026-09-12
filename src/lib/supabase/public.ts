import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Anonymous, cookieless Supabase client for PUBLIC content only.
 *
 * `createClient()` in `server.ts` reads cookies to carry the visitor's session.
 * Touching `cookies()` opts a route out of static rendering, and during
 * `next build` it throws outright — which is why the marketing footer was
 * silently falling back to defaults on statically rendered routes instead of
 * showing the values in `site_settings`.
 *
 * Public marketing content (`site_content`, `site_settings`, `regions`,
 * `delivery_zones`) is the same for every visitor and is readable by `anon`
 * under RLS, so it needs no session. Reading it through this client keeps those
 * routes statically renderable and makes the data available at build time.
 *
 * Use this ONLY for data that is identical for every visitor and safe for
 * `anon` to see. Anything user-scoped must go through `server.ts` so RLS can
 * see who is asking.
 */
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
