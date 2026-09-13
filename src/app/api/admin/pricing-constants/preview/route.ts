import { NextRequest } from "next/server";
import { z } from "zod";

import { RATE_LIMIT } from "@/config/security";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { previewWorkedExample } from "@/features/pricing/services/pricing-console.service";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { requireAdmin, requireAuth } from "@/lib/auth/guards";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/admin/pricing-constants/preview
 *
 * Prices the worked example against constants the admin has typed but NOT
 * saved, so the consequence of a change can be read before it is committed.
 * Writes nothing — see `pricing-console.service.ts`.
 *
 * The overrides are a projection, not an input to a real quote: the customer
 * flow never reaches this route, and `createOrder` recomputes from the stored
 * rows regardless of anything that happened here.
 */
const previewSchema = z.object({
  input: z.object({
    subject: z.string().min(1).max(120),
    item_price_usd: z.number().positive().max(50_000),
    quantity: z.number().int().min(1).max(100),
    category: z.string().min(1).max(120),
    product_title: z.string().min(1).max(300),
    product_image_key: z.string().max(120).nullable(),
    weight_lbs: z.number().positive().max(2_000).nullable(),
    region: z.enum(["usa", "uk", "china"]),
    price_presets_usd: z.array(z.number().positive().max(50_000)).max(6),
  }),
  /**
   * Proposed constant values, keyed exactly as `pricing_constants.key`. Stored
   * as fractions, the same as the column — the console converts a typed "4%"
   * to 0.04 before it gets here, so the two sides of the comparison cannot be
   * on different scales.
   */
  overrides: z.record(z.string().min(1).max(64), z.number().finite()).default({}),
});

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-pricing-preview:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    requireAdmin(auth);

    const parsed = previewSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const example = await previewWorkedExample(parsed.data.input, parsed.data.overrides);
    return successResponse(example);
  } catch (error) {
    return errorResponse(error);
  }
}
