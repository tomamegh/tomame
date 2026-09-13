import { NextRequest } from "next/server";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { resolveViewer } from "@/lib/quote-session";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { addToBagSchema, setBagDeliverySchema } from "@/features/bag/schema";
import { addToBag, getBag, setBagDelivery } from "@/features/bag/services/bag.service";

/**
 * GET   /api/cart — the viewer's bag, every line re-priced server-side.
 * POST  /api/cart — add a stored quote to the bag.
 * PATCH /api/cart — choose where it goes (an address needs sign-in; the service says so).
 *
 * Public like the rest of the quote flow: a signed-out visitor owns the bag
 * through the httpOnly quote-session cookie and signs in at checkout. The body
 * names a quote and a quantity; every number comes from the server.
 */

function viewerKey(userId: string | null, sessionId: string | null, request: NextRequest): string {
  return userId ?? sessionId ?? request.headers.get("x-forwarded-for") ?? "unknown";
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const { viewer, finalize } = resolveViewer(request, user?.id ?? null);
    if (!checkRateLimit(`cart-read:${viewerKey(viewer.userId, viewer.sessionId, request)}`, RATE_LIMIT.general).allowed) {
      throw new APIError(429, "Too many requests");
    }
    return finalize(successResponse(await getBag(viewer)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const { viewer, finalize } = resolveViewer(request, user?.id ?? null);
    if (!checkRateLimit(`cart-write:${viewerKey(viewer.userId, viewer.sessionId, request)}`, RATE_LIMIT.general).allowed) {
      throw new APIError(429, "Too many requests");
    }
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = addToBagSchema.safeParse(body);
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");

    const result = await addToBag(viewer, parsed.data);
    return finalize(successResponse(result, result.created ? 201 : 200));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const { viewer, finalize } = resolveViewer(request, user?.id ?? null);
    if (!checkRateLimit(`cart-write:${viewerKey(viewer.userId, viewer.sessionId, request)}`, RATE_LIMIT.general).allowed) {
      throw new APIError(429, "Too many requests");
    }
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = setBagDeliverySchema.safeParse(body);
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");

    return finalize(successResponse(await setBagDelivery(viewer, parsed.data)));
  } catch (error) {
    return errorResponse(error);
  }
}
