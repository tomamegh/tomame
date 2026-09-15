import { NextRequest } from "next/server";
import { z } from "zod";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { carIdSchema, updateCarListingSchema } from "@/features/cars/schema";
import {
  deleteCar,
  getCarForAdmin,
  setCarPublished,
  updateCar,
} from "@/features/cars/services/cars.service";

/**
 * One car listing: read it, replace it, publish it, remove it (migration 067).
 *
 * Auth, rate limit, validation and status codes only — the writes, the price
 * invariant and the `audit_logs` rows they owe are
 * `features/cars/services/cars.service`.
 *
 * WHY PUT IS A FULL REPLACEMENT AND PUBLISHING IS A SEPARATE VERB. The price
 * rule spans two columns ("on request" and a price cannot coexist), so a partial
 * patch cannot be judged on its own — the admin form holds the whole listing and
 * sends the whole listing. Publishing is the exception because it happens from a
 * list screen that does NOT hold the rest of the row: routing a toggle through
 * the replacement would let it rewrite twenty other columns with whatever that
 * screen last had in memory. It arrives as PATCH with a single field.
 */

/** The only thing PATCH accepts. Anything else is a PUT. */
const publishSchema = z.object({ is_published: z.boolean() });

function carId(raw: string): string {
  const parsed = carIdSchema.safeParse(raw);
  // A malformed id is a 404 rather than a 400: "that is not a listing" is the
  // same answer whether the id is badly shaped or simply not there, and telling
  // the two apart is not the caller's business.
  if (!parsed.success) throw new APIError(404, "Car listing not found");
  return parsed.data;
}

/** GET — one listing and its gallery, whatever its publish state. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-cars-read:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    requireAdmin(auth);

    const { id } = await params;
    const found = await getCarForAdmin(carId(id));
    if (!found) throw new APIError(404, "Car listing not found");

    return successResponse(found);
  } catch (error) {
    return errorResponse(error);
  }
}

/** PUT — replace the editable half of one listing. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-cars:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    const admin = requireAdmin(auth);

    const { id } = await params;

    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });

    const parsed = updateCarListingSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const car = await updateCar(
      { id: admin.id, email: admin.email ?? null },
      carId(id),
      parsed.data,
    );

    return successResponse(car);
  } catch (error) {
    return errorResponse(error);
  }
}

/** PATCH — put the listing on the site, or take it off. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-cars:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    const admin = requireAdmin(auth);

    const { id } = await params;

    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });

    const parsed = publishSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const car = await setCarPublished(
      { id: admin.id, email: admin.email ?? null },
      carId(id),
      parsed.data.is_published,
    );

    return successResponse(car);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE — remove the listing, its photo rows (by cascade) and their objects.
 *
 * Deleting something that is already gone answers 200 with the id, exactly as
 * `/api/admin/policies/[slug]` does: the caller's world is the same either way,
 * and a 404 on a double-clicked delete is a confusing way to say "done".
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-cars:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    const admin = requireAdmin(auth);

    const { id } = await params;
    await deleteCar({ id: admin.id, email: admin.email ?? null }, carId(id));

    return successResponse({ id });
  } catch (error) {
    return errorResponse(error);
  }
}
