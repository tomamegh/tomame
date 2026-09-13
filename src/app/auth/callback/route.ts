import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { postAuthDestination } from "@/lib/auth/post-auth-destination";

/**
 * The OAuth return leg — Google hands back a code, we exchange it for a session.
 *
 * Where it then sends the browser is the shared rule (`postAuthDestination`):
 * an explicit `?next=` wins, otherwise an **admin lands in the admin view** and
 * everyone else in the storefront. This used to be a hardcoded `/app`, so an
 * administrator signing in with Google was dropped into the customer app.
 *
 * The role is read from the session that was just minted, where
 * `custom_access_token_hook` puts `app_metadata.role`, using the same
 * `canAccessAdmin` predicate the proxy gates `/admin` with — so the destination
 * and the gate cannot disagree and bounce the person straight back out.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const destination = postAuthDestination({
        next,
        isAdmin: canAccessAdmin(data.session?.user ?? null),
      });

      // The original host before the load balancer. Without this the redirect
      // goes to the internal origin and the customer lands on a URL that is not
      // the site they signed in to.
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";

      if (isLocalEnv) {
        // No load balancer in front of a local dev server, so the request's own
        // origin is the right one and `x-forwarded-host` must not be trusted.
        return NextResponse.redirect(`${origin}${destination}`);
      }
      if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${destination}`);
      }
      return NextResponse.redirect(`${origin}${destination}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
