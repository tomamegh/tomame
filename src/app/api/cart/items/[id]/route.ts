import { NextRequest } from "next/server";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { resolveViewer } from "@/lib/quote-session";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { bagLineIdSchema, updateBagLineSchema } from "@/features/bag/schema";
import { removeBagLine, updateBagLine } from "@/features/bag/services/bag.service";

/**
 * PATCH  /api/cart/items/:id — change a line's quantity or note (re-priced server-side).
 * DELETE /api/cart/items/:id — remove a line.
 * The line must belong to the viewer's own open bag; anything else is a 404.
 */

type Params = { params: Promise<{ id: string }> };

async function prepare(request: NextRequest, params: Params["params"]) {
  const user = await getAuthenticatedUser();
  const { viewer, finalize } = resolveViewer(request, user?.id ?? null);
  const key = viewer.userId ?? viewer.sessionId ?? request.headers.get("x-forwarded-for") ?? "unknown";
  if (!checkRateLimit(`cart-write:${key}`, RATE_LIMIT.general).allowed) throw new APIError(429, "Too many requests");
  const { id } = await params;
  const parsedId = bagLineIdSchema.safeParse(id);
  if (!parsedId.success) throw new APIError(404, "That line is not in your bag");
  return { viewer, finalize, id: parsedId.data };
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { viewer, finalize, id } = await prepare(request, params);
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = updateBagLineSchema.safeParse(body);
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    return finalize(successResponse(await updateBagLine(viewer, id, parsed.data)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { viewer, finalize, id } = await prepare(request, params);
    return finalize(successResponse(await removeBagLine(viewer, id)));
  } catch (error) {
    return errorResponse(error);
  }
}
