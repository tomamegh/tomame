import { NextRequest } from "next/server";
import { calculatePricing } from "@/features/pricing/services/pricing.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { z } from "zod";

const previewSchema = z.object({
  itemPriceUsd: z.coerce.number().positive().max(50000),
  quantity: z.coerce.number().int().min(1).max(100),
  region: z.enum(["USA", "UK", "CHINA"]),
});

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const _authUser = requireAuth(user);

    const { searchParams } = new URL(request.url);
    const parsed = previewSchema.safeParse({
      itemPriceUsd: searchParams.get("itemPriceUsd"),
      quantity: searchParams.get("quantity"),
      region: searchParams.get("region"),
    });
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const breakdown = await calculatePricing(
      parsed.data.itemPriceUsd,
      parsed.data.quantity,
      parsed.data.region
    );

    return successResponse(breakdown);
  } catch (err) {
    return errorResponse(err);
  }
}
