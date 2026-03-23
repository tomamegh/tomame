import { NextRequest } from "next/server";
import { PricingCalculator } from "@/lib/pricing";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { z } from "zod";

const previewSchema = z.object({
  itemPriceUsd: z.coerce.number().positive().max(50000),
  quantity: z.coerce.number().int().min(1).max(100),
  category: z.string().optional(),
  weightLbs: z.coerce.number().positive().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const _authUser = requireAuth(user);

    const { searchParams } = new URL(request.url);
    const parsed = previewSchema.safeParse({
      itemPriceUsd: searchParams.get("itemPriceUsd"),
      quantity: searchParams.get("quantity"),
      category: searchParams.get("category") || undefined,
      weightLbs: searchParams.get("weightLbs") || undefined,
    });
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const calculator = new PricingCalculator();
    const breakdown = await calculator.calculate(parsed.data);

    return successResponse(breakdown);
  } catch (err) {
    return errorResponse(err);
  }
}
