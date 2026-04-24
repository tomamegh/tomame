import { NextRequest } from "next/server";
import { extractProductSchema } from "@/features/extraction/schema";
import { extractProductData } from "@/features/extraction/extraction.service";
import { getUserSession } from "@/features/auth/services/auth.service";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

// Microcenter can need multiple Browserless retries; default Vercel timeout
// (10s Hobby / 60s Pro) is too short for the worst case. Requires Vercel Pro.
export const maxDuration = 120;

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

    const { user } = await getUserSession();

    // Platform detection is handled inside extractProductData after short-URL
    // resolution, so pasted bit.ly / ebay.to / a.co links route correctly.
    const data = await extractProductData(parsed.data.product_url, user.id);
    return successResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
