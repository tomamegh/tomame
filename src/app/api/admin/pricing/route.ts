import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { getAll, updateRegionPricing } from "@/features/pricing/services/pricing.service";
import { z } from "zod";

const patchSchema = z.object({
  region: z.enum(["USA", "UK", "CHINA"]),
  baseShippingFeeUsd: z.number().positive(),
  serviceFeePercentage: z.number().min(0).max(1),
});

export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-pricing:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    requireAdmin(auth);

    const data = await getAll(createAdminClient());
    return successResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-pricing:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    const admin = requireAdmin(auth);

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { region, baseShippingFeeUsd, serviceFeePercentage } = parsed.data;
    const client = createAdminClient();

    // Fetch current config to preserve existing exchange_rate
    const { configs } = await getAll(client);
    const current = configs.find((c) => c.region === region);
    if (!current) {
      throw new APIError(404, `Pricing config not found for region ${region}`);
    }

    const updated = await updateRegionPricing(
      client,
      admin,
      region,
      baseShippingFeeUsd,
      current.exchange_rate,
      serviceFeePercentage,
    );

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
