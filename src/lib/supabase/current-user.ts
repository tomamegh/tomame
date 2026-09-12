import "server-only";

import { cache } from "react";

import { createClient } from "./server";

/**
 * Whether the visitor has a session, for server components that only need to
 * branch a link or a label (the marketing nav, the closing CTA).
 *
 * Wrapped in `cache` so a layout and its page resolving the session in the same
 * render pass cost one round trip, not two. Never use this for authorisation —
 * route handlers and services do their own checks.
 */
export const isAuthenticated = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user != null;
});
