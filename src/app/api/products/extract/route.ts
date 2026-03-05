import { NextRequest } from "next/server";
import { extractProductSchema } from "@/features/extraction/extraction.validators";
import { extractProductData } from "@/features/extraction/extraction.service";
import { isDomainAllowed } from "@/features/stores/stores.service";
import { getAuthenticatedUser } from "@/features/auth/auth.service";
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

    // Validate URL domain against supported stores (resolves shortened URLs)
    const { allowed: domainAllowed, resolvedUrl } = await isDomainAllowed(parsed.data.productUrl);
    if (!domainAllowed) {
      throw new APIError(400, "Product URL must be from a supported store");
    }

    // Use the resolved URL for extraction so domain selectors and country mapping work
    const result = await extractProductData(resolvedUrl);
    if (!result.success) throw new APIError(result.status, result.error);

    return successResponse({
      ...result.data,
      resolvedUrl: resolvedUrl !== parsed.data.productUrl ? resolvedUrl : undefined,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
