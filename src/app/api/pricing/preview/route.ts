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
  productName: z.string().optional(),
  category: z.string().optional(),
  weightLbs: z.coerce.number().positive().optional(),
  dimensionsInches: z.string().optional(),
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
      productName: searchParams.get("productName") || undefined,
      category: searchParams.get("category") || undefined,
      weightLbs: searchParams.get("weightLbs") || undefined,
      dimensionsInches: searchParams.get("dimensionsInches") || undefined,
    });
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { dimensionsInches: dimStr, ...rest } = parsed.data;

    // Parse dimensions string "LxWxH" if provided
    let dimensionsInches: { length: number; width: number; height: number } | undefined;
    if (dimStr) {
      const match = dimStr.match(/([\d.]+)\s*[x×]\s*([\d.]+)\s*[x×]\s*([\d.]+)/);
      if (match?.[1] && match[2] && match[3]) {
        dimensionsInches = {
          length: parseFloat(match[1]),
          width: parseFloat(match[2]),
          height: parseFloat(match[3]),
        };
      }
    }

    const breakdown = await calculatePricing({
      itemPriceUsd: rest.itemPriceUsd,
      quantity: rest.quantity,
      region: rest.region,
      productName: rest.productName,
      category: rest.category,
      weightLbs: rest.weightLbs,
      weightSource: rest.weightLbs ? "scraped" : undefined,
      dimensionsInches,
    });

    return successResponse(breakdown);
  } catch (err) {
    return errorResponse(err);
  }
}
