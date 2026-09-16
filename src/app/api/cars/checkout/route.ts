import { NextRequest } from "next/server";

import { carCheckoutSchema } from "@/features/cars/car-orders.schema";
import { startCarCheckout } from "@/features/cars/services/car-orders.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * POST /api/cars/checkout — buy one car, in full, now (migration 068).
 *
 * Body: `{ "carListingId": "<uuid>" }`, and nothing else. Answers
 * `{ success: true, data: { authorizationUrl, reference } }`; 401 signed out,
 * 404 no such car, 409 not purchasable (unpublished, on request, already sold,
 * or a live payment is already open), 429 rate limited.
 *
 * A CUSTOMER ROUTE, NOT AN ADMIN ONE. `requireAuth` and not `requireAdmin`: an
 * admin writes the listing, a customer buys it.
 *
 * THE ROUTE DOES AUTH, RATE LIMITING AND SHAPE. Everything else — which cars are
 * purchasable, where the price comes from, the audit row, the Paystack call — is
 * `car-orders.service.ts`. CLAUDE.md: `app/api/**` contains no business logic.
 *
 * THE PRICE IS NOT IN THE REQUEST AND CANNOT BE. `carCheckoutSchema` has exactly
 * one field, so there is no amount for a caller to name; the service reads
 * `car_listings.price_pesewas` server-side and snapshots it. The largest charge
 * this platform takes is also the one with the least client input.
 *
 * `RATE_LIMIT.orders` — five per hour, the budget order creation uses, and the
 * right shape for the same reason: each request through here can write a row
 * that RESERVES A PHYSICAL VEHICLE, and a loop on this endpoint would take every
 * car on the site off the market. Its own bucket (the key is per route), so a
 * customer's car checkout does not spend their order-creation budget.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`cars-checkout:${ip}`, RATE_LIMIT.orders).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = carCheckoutSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);

    const data = await startCarCheckout(auth, parsed.data);
    return successResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
