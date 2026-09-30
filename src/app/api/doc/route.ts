import { NextResponse } from "next/server";
import { getApiDocs } from "@/lib/swagger";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";

/** The OpenAPI spec, admins only. A 404 for anyone else: its existence is not public. */
export async function GET() {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!canAccessAdmin(user)) {
    return NextResponse.json({ error: "Not found", success: false }, { status: 404 });
  }
  return NextResponse.json(getApiDocs());
}
