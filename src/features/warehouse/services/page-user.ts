import "server-only";

import { notFound, redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import type { PlatformUser } from "@/features/users/types";
import { canAccessWarehouse } from "@/lib/auth/admin-access";

/**
 * The signed-in operator for a warehouse PAGE (081).
 *
 * The proxy admits a request on a valid JWT, but `getAuthenticatedUser` asks
 * Supabase for the user — and a session revoked since the token was minted (a
 * role change, a sign-out elsewhere) passes the first and fails the second.
 * `requireAuth` then threw, and the operator saw the error page ("Screen failed
 * to render: Authentication Required", caught by error capture on 2026-09-30).
 * A page answers that with the sign-in screen instead, and comes back here.
 */
export async function warehousePageUser(returnTo: string): Promise<PlatformUser> {
  const user = await getAuthenticatedUser();
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(returnTo)}`);
  if (!canAccessWarehouse(user)) notFound();
  return user;
}
