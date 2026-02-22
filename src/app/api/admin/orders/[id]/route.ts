import { NextRequest } from "next/server";
import { z } from "zod";
import { getOrder, updateOrderStatusAdmin } from "@/features/orders/orders.service";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";

const updateStatusSchema = z.object({
  status: z.enum(["pending", "paid", "processing", "completed", "cancelled"]),
});

/**
 * @swagger
 * /api/admin/orders/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Get any order by ID (admin)
 *     security:
 *       - bearerAuth: []
 *   patch:
 *     tags: [Admin]
 *     summary: Update order status (admin)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, paid, processing, completed, cancelled]
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    if (!auth.ok) throw new APIError(auth.status, auth.error);

    const admin = requireAdmin(auth.user);
    if (!admin.ok) throw new APIError(admin.status, admin.error);

    const { id } = await params;
    const result = await getOrder(admin.user, id);
    if (!result.success) throw new APIError(result.status, result.error);

    return successResponse(result.data);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    if (!auth.ok) throw new APIError(auth.status, auth.error);

    const admin = requireAdmin(auth.user);
    if (!admin.ok) throw new APIError(admin.status, admin.error);

    const body: unknown = await request.json().catch(() => { throw new APIError(400, "Invalid JSON"); });
    const parsed = updateStatusSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { id } = await params;
    const result = await updateOrderStatusAdmin(admin.user, id, parsed.data.status);
    if (!result.success) throw new APIError(result.status, result.error);

    return successResponse(result.data);
  } catch (error) {
    return errorResponse(error);
  }
}
