import { NextRequest } from "next/server";
import { createStoreSchema } from "@/features/stores/stores.validators";
import { listStores, createStore } from "@/features/stores/stores.service";
import { getAuthenticatedUser } from "@/features/auth/auth.service";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-stores:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    if (!auth.ok) throw new APIError(auth.status, auth.error);
    const admin = requireAdmin(auth.user);
    if (!admin.ok) throw new APIError(admin.status, admin.error);

    const result = await listStores(admin.user);
    if (!result.success) throw new APIError(result.status, result.error);

    return successResponse(result.data);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-stores:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = createStoreSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    if (!auth.ok) throw new APIError(auth.status, auth.error);
    const admin = requireAdmin(auth.user);
    if (!admin.ok) throw new APIError(admin.status, admin.error);

    const result = await createStore(admin.user, parsed.data);
    if (!result.success) throw new APIError(result.status, result.error);

    return successResponse(result.data, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
