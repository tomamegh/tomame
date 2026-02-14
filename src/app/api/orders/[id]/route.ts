import { NextRequest } from "next/server";
import { getOrder } from "@/features/orders/orders.service";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, errorResponse } from "@/lib/auth/api-helpers";

/**
 * @swagger
 * /api/orders/{id}:
 *   get:
 *     tags: [Orders]
 *     summary: Get order by ID
 *     description: Returns a single order. Users can only see their own orders; admins can see any order.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Order ID
 *     responses:
 *       200:
 *         description: Order details with pricing breakdown
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Order not found
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Require authenticated user
  const user = await getAuthenticatedUser();
  const auth = requireAuth(user);
  if (!auth.ok) {
    return errorResponse(auth.error, auth.status);
  }

  const { id } = await params;

  const result = await getOrder(auth.user, id);

  if (!result.success) {
    return errorResponse(result.error, result.status);
  }

  return successResponse(result.data);
}
