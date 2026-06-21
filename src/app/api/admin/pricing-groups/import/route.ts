import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import {
  previewPricingImport,
  applyPricingImport,
} from "@/features/pricing/services/pricing-import-export.service";

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-pricing-import:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    const admin = requireAdmin(auth);

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      throw new APIError(400, "No file provided. Upload an .xlsx file.");
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new APIError(400, "File too large. Maximum 5MB.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mode = request.nextUrl.searchParams.get("mode");

    if (mode === "confirm") {
      const result = await applyPricingImport(buffer, admin.id);
      return successResponse(result);
    }

    // Default: preview mode
    const preview = await previewPricingImport(buffer);
    return successResponse(preview);
  } catch (error) {
    return errorResponse(error);
  }
}
