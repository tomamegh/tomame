import { NextRequest } from "next/server";
import { z } from "zod";

import { adminRequoteBag } from "@/features/bag/services/bag-requote.service";
import { getUserSession } from "@/features/auth/services/auth.service";
import { canAccessAdmin } from "@/lib/auth/admin-access";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

const bodySchema = z.object({ apply: z.boolean().default(false) });

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/admin/bags/:id/requote — preview (apply: false) or store (apply: true) a re-quote at today's rate (Fix 14). */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    if (!(await checkRateLimit(`admin-bag-requote:${getClientIp(request)}`, RATE_LIMIT.admin)).allowed) {
      throw new APIError(429, "Too many requests");
    }
    const { session, user } = await getUserSession();
    if (!canAccessAdmin(session)) throw new APIError(403, "Admin access required");
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new APIError(400, "Unknown bag");
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw new APIError(400, "Invalid request");
    return successResponse(await adminRequoteBag(user.id, id, parsed.data.apply));
  } catch (error) {
    return errorResponse(error);
  }
}
