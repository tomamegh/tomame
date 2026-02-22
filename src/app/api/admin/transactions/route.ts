import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/features/auth/auth.service";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { listAllTransactions } from "@/features/payments/payments.service";

/**
 * @swagger
 * /api/admin/transactions:
 *   get:
 *     tags: [Admin]
 *     summary: List all payment transactions (admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, success, failed]
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of transactions
 *       403:
 *         description: Admin access required
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    if (!auth.ok) throw new APIError(auth.status, auth.error);

    const admin = requireAdmin(auth.user);
    if (!admin.ok) throw new APIError(admin.status, admin.error);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? undefined;
    const userId = searchParams.get("userId") ?? undefined;

    const result = await listAllTransactions(admin.user, { status, userId });
    if (!result.success) throw new APIError(result.status, result.error);

    return successResponse(result.data);
  } catch (error) {
    return errorResponse(error);
  }
}
