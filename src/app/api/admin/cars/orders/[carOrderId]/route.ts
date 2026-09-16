import { NextRequest } from "next/server";
import * as z from "zod";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { releaseCarOrder } from "@/features/cars/services/car-orders.service";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { requireAdmin, requireAuth } from "@/lib/auth/guards";

const releaseSchema = z.object({
  action: z.literal("release"),
  reason: z
    .string()
    .trim()
    .min(1, "Say why this sale is being unwound.")
    .max(500, "Keep the reason under 500 characters."),
});

/**
 * PATCH /api/admin/cars/orders/:carOrderId — unwind a sale and free the car.
 *
 * WHAT IT IS FOR. `uq_car_orders_live` deliberately keeps a car off the market
 * for as long as an order on it is alive, which is right until a sale falls
 * through: a refund, a vehicle damaged on the water, a buyer who walks away.
 * Without this route that listing is unsellable forever and the only recourse
 * is editing the database by hand — `cancelCarOrder` refuses a paid order with
 * "it needs a refund" and offers no way to record one.
 *
 * IT MOVES NO MONEY. Refunding is a Paystack action an admin performs
 * deliberately; this records that the sale is over and puts the car back up.
 * The two are separate on purpose — a route that silently refunded a five-figure
 * payment as a side effect of a status change would be a far worse thing to own.
 *
 * `action` is a literal rather than a bare reason so this endpoint can grow
 * other admin moves on a car order without a second route, and so an empty body
 * can never be read as "release it".
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ carOrderId: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    const admin = requireAdmin(auth);

    const { carOrderId } = await params;
    if (!z.uuid().safeParse(carOrderId).success) {
      throw new APIError(400, "Invalid car order id");
    }

    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });

    const parsed = releaseSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const released = await releaseCarOrder(
      { id: admin.id, role: "admin" },
      carOrderId,
      parsed.data.reason,
    );

    // `false` means the row moved between the read and the guarded write —
    // somebody else acted on this order. Not an error, but not what was asked
    // for either, so it is reported rather than dressed up as success.
    return successResponse({ released });
  } catch (error) {
    return errorResponse(error);
  }
}
