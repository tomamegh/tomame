import { CookieOptions, createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { canAccessAdmin } from "@/lib/auth/admin-access";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(supabaseUrl!, supabaseKey!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options?: CookieOptions;
        }[],
      ) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const { data } = await supabase.auth.getClaims();

  const user = data?.claims;
  const pathname = request.nextUrl.pathname;

  // ── Route config ────────────────────────────────────────────────────────────
  // Add any new protected prefixes here. No other code needs to change.
  const authRoutes = ["/app", "/admin"]; // requires login
  // Requires the admin role.
  //
  // `/api/admin` IS LOAD-BEARING, not belt and braces. `adminRoutes` was
  // `["/admin"]` alone, and `/api/admin/dashboard` does not start with `/admin`
  // — it starts with `/api`. That route carried no check of its own either, so
  // it answered ANY unauthenticated caller with the business's order count,
  // revenue and customer count from a service-role client; verified live on
  // both hosted projects on 2026-09-13. Every other `/api/admin/*` route
  // happened to check for itself, so nothing else leaked.
  //
  // Gating the prefix here makes the whole namespace fail closed, so the next
  // admin route added by someone who assumes "the admin is already gated" is
  // right by default instead of silently public.
  const adminRoutes = ["/admin", "/api/admin"];
  // The quote flow (paste link → preview → review) is open to visitors; the
  // order submit API and everything after it still require a session.
  const publicRoutes = ["/app/orders/new", "/app/orders/review", "/app/bag"];

  const isPublic = publicRoutes.some((p) => pathname.startsWith(p));
  const isAdminRoute = adminRoutes.some((p) => pathname.startsWith(p));
  const isProtected =
    !isPublic && (isAdminRoute || authRoutes.some((p) => pathname.startsWith(p)));

  // An API route must answer with a STATUS, never a redirect. A 302 to
  // /auth/login reaches `fetch` as a 200 of HTML, which the client parses as
  // JSON and reports as a parse error — the caller cannot tell "signed out"
  // from "the server broke", and neither can anyone reading the logs.
  const isApi = pathname.startsWith("/api/");

  // Unauthenticated users → login
  if (isProtected && !user) {
    if (isApi) return jsonError(401, "Authentication required");
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  // Authenticated non-admins → back to app. One rule, shared with the navbars:
  // `canAccessAdmin`. This used to also admit anyone whose EMAIL ended in
  // `@tomame.ca`, regardless of role — a domain backdoor around the very column
  // that decides this.
  if (isAdminRoute && !canAccessAdmin(user)) {
    if (isApi) return jsonError(403, "Admin access required");
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.redirect(url);
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}

/**
 * The refusal an API caller gets from the gate.
 *
 * Shaped exactly like `errorResponse` in `lib/auth/api-helpers` — same
 * `{ success: false, error }` envelope — so a client cannot tell a refusal made
 * here from one made inside a route handler, and `ApiFetchError` reports both
 * the same way.
 */
function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ success: false, error: message }, { status });
}
