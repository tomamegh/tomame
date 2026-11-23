import { NextResponse } from "next/server";

import { alertIfNewSignup } from "@/features/auth/services/signup-alert";
import { canAccessAdmin, isDriver, isWarehouseOnly } from "@/lib/auth/admin-access";
import { postAuthDestination } from "@/lib/auth/post-auth-destination";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /auth/finish — where Google's own button lands once Supabase has made the
 * session from Google's ID token (google-identity-button.tsx). Does what
 * `/auth/callback` does after a redirect sign-in: the new-sign-up alert, then
 * the account's home (admin, warehouse, driver, customer) or the safe `next`.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.redirect(`${origin}/auth/login`);
  alertIfNewSignup(data.user);
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims ?? null;
  const destination = postAuthDestination({
    next: searchParams.get("next"),
    isAdmin: canAccessAdmin(claims),
    isWarehouse: isWarehouseOnly(claims),
    isDriver: isDriver(claims),
  });
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (process.env.NODE_ENV !== "development" && forwardedHost) return NextResponse.redirect(`https://${forwardedHost}${destination}`);
  return NextResponse.redirect(`${origin}${destination}`);
}
