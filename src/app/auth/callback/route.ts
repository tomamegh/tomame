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
 * THE ROLE COMES FROM THE ACCESS TOKEN, NOT FROM `session.user`.
 *
 * `custom_access_token_hook` injects `app_metadata.role` into the JWT CLAIMS as
 * the token is minted. It does not write `auth.users.raw_app_meta_data`, and
 * `session.user` is built from that row — so `session.user.app_metadata.role` is
 * undefined for every account on a hosted project, including real admins. This
 * route used to read exactly that, so an administrator signing in with Google
 * was sent to the customer storefront: the value it tested was always absent.
 *
 * It was invisible locally because the hook is commented out in
 * `supabase/config.toml`, so the one local admin has the role set directly on
 * `raw_app_meta_data` instead — where `session.user` DOES see it. The local
 * workaround and the hosted mechanism populate different places, and only the
 * hosted one is real.
 *
 * `getClaims()` reads the decoded token, which is what `src/lib/supabase/proxy.ts`
 * gates `/admin` on — so the destination and the gate now read the same value
 * and cannot bounce the person straight back out.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const { data: claimsData } = await supabase.auth.getClaims();
      const destination = postAuthDestination({
        next,
        isAdmin: canAccessAdmin(claimsData?.claims ?? null),
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
