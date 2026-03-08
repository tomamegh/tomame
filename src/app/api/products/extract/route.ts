import { NextRequest } from "next/server";
import { extractProductSchema } from "@/features/extraction/schema";
import { extractProductData } from "@/features/extraction/extraction.service";
import { resolvePlatform } from "@/features/extraction/scrapers";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`extraction:${ip}`, RATE_LIMIT.extraction).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = extractProductSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    if (!auth.ok) throw new APIError(auth.status, auth.error);

    // Validate URL domain against supported platforms (hardcoded in scrapers)
    const platform = resolvePlatform(parsed.data.productUrl);
    if (!platform) {
      throw new APIError(400, "Product URL must be from a supported store");
    }

    const result = await extractProductData(parsed.data.productUrl);
    if (!result.success) throw new APIError(result.status, result.error);

    return successResponse(result.data);
  } catch (error) {
    return errorResponse(error);
  }
}
