import { NextRequest } from "next/server";
import * as z from "zod";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { carOrderAdminActionSchema } from "@/features/cars/car-orders.schema";
import {
  recordCarBalancePayment,
  releaseCarOrder,
} from "@/features/cars/services/car-orders.service";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { requireAdmin, requireAuth } from "@/lib/auth/guards";

/**
 * PATCH /api/admin/cars/orders/:carOrderId — the two admin moves on a car sale.
 *
 * `{ action: "record_balance", amountPesewas, note? }` — THE OTHER HALF OF THE
 * DEPOSIT MODEL (069). Paystack took a deposit and reserved the car; the rest
 * arrived by bank transfer or in person, and this is where a person says so.
 * `deposit_paid → paid`, on a guarded compare-and-set, with an audit row.
 *
 * THE AMOUNT IS REQUIRED AND IS NOT TRUSTED. `recordCarBalancePayment` checks it
 * against `price_pesewas - deposit_pesewas` on the row and refuses anything
 * else, so the request CONFIRMS the balance rather than choosing it — the figure
 * on the receipt is one a person deliberately typed, and a misclick cannot
 * declare a five-figure debt settled. CLAUDE.md: never trust the client, and an
 * admin is a client too.
 *
 * NEITHER ACTION MOVES MONEY. Recording a balance records a fact about money
 * that arrived somewhere else; releasing records that a sale is over. A route
 * that captured or refunded as a side effect of a status change would be a far
 * worse thing to own.
 *
 * `{ action: "release", reason }` — unwind a sale and free the car.
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
 * `action` DISCRIMINATES, which is what lets one route carry both without them
 * being confusable: an empty body can never be read as "release it", and a
 * release can never be read as a receipt for a balance nobody paid.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ carOrderId: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    const admin = requireAdmin(auth);
    if (!(await checkRateLimit(`admin-car-orders:${admin.id}`, RATE_LIMIT.admin)).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const { carOrderId } = await params;
    if (!z.uuid().safeParse(carOrderId).success) {
      throw new APIError(400, "Invalid car order id");
    }

    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });

    const parsed = carOrderAdminActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    if (parsed.data.action === "record_balance") {
      const recorded = await recordCarBalancePayment({ id: admin.id, role: "admin" }, carOrderId, {
        amountPesewas: parsed.data.amountPesewas,
        note: parsed.data.note ?? null,
      });
      // `false` here means the balance was already recorded — by another admin,
      // or by this one twice. Idempotent by design, and reported honestly rather
      // than as a second success.
      return successResponse({ recorded });
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
