import { NextRequest } from "next/server";
import { listCustomerOrderEvents } from "@/features/orders/services/order-events.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, errorResponse } from "@/lib/auth/api-helpers";

/**
 * `GET /api/orders/:id/events` — the journey's Updates timeline (`v2-detail`,
 * design line 351).
 *
 * HTTP orchestration only: authenticate, delegate, respond. Ownership and the
 * customer-visible filter both live in the service, so this route cannot be the
 * place someone forgets one of them. An order belonging to somebody else answers
 * 404, not 403 — the same shape the rest of the orders API uses, so the endpoint
 * cannot be walked to discover which ids exist.
 *
 * Not the sibling of `/history`, which reads `audit_logs` and is admin-worded.
 * These are two different logs for two different readers; see migration 050.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);

    const { id } = await params;
    const data = await listCustomerOrderEvents(auth, id);
    return successResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
}
