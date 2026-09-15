import { NextRequest } from "next/server";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { adminCarListQuerySchema, createCarListingSchema } from "@/features/cars/schema";
import { createCar, listCarsForAdmin } from "@/features/cars/services/cars.service";

/**
 * The cars an admin owns: list them, add one (migration 067).
 *
 * AUTH, VALIDATION AND STATUS CODES ONLY. The write, the three-state price rule
 * and the `audit_logs` row every change owes are
 * `features/cars/services/cars.service`; CLAUDE.md keeps business logic out of
 * `app/api/**`.
 *
 * The three lines below are the house form for an admin route and there is no
 * inline `role === "admin"` anywhere in this file — `requireAdmin` wraps
 * `canAccessAdmin`, which is the single rule, because the JWT claim and the
 * `profiles` row disagree for every real admin on hosted Supabase.
 */

/** GET — every listing, drafts included. The admin console's index. */
export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-cars-read:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    requireAdmin(auth);

    const parsed = adminCarListQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { cars, total } = await listCarsForAdmin({
      // Absent means "both". The query layer only filters when the option is
      // defined, so an unset filter must stay undefined rather than become false.
      publishedOnly:
        parsed.data.published === undefined ? undefined : parsed.data.published === "true",
      search: parsed.data.search,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });

    return successResponse({ cars, total });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST — add a listing. Unpublished unless the body says otherwise. */
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-cars:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    const admin = requireAdmin(auth);

    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });

    const parsed = createCarListingSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const car = await createCar({ id: admin.id, email: admin.email ?? null }, parsed.data);

    return successResponse(car, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
