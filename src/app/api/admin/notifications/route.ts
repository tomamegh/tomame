import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/features/auth/auth.service";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { listAllNotifications } from "@/features/notifications/notifications.service";

/**
 * @swagger
 * /api/admin/notifications:
 *   get:
 *     tags: [Admin]
 *     summary: List all notifications (admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, sent, failed]
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: channel
 *         schema:
 *           type: string
 *           enum: [email, whatsapp]
 *     responses:
 *       200:
 *         description: List of notifications
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
    const channel = searchParams.get("channel") ?? undefined;

    const result = await listAllNotifications(admin.user, { status, userId, channel });
    if (!result.success) throw new APIError(result.status, result.error);

    return successResponse(result.data);
  } catch (error) {
    return errorResponse(error);
  }
}
