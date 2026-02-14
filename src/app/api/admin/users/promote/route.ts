import { NextRequest } from "next/server";
import { promoteUserSchema } from "@/features/users/users.validators";
import { promoteUserToAdmin } from "@/features/users/users.service";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * @swagger
 * /api/admin/users/promote:
 *   post:
 *     tags: [Admin]
 *     summary: Promote user to admin
 *     description: Promotes an existing customer to admin role. Requires admin authentication.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId:
 *                 type: string
 *                 format: uuid
 *                 example: 550e8400-e29b-41d4-a716-446655440000
 *     responses:
 *       200:
 *         description: User promoted to admin
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 *       429:
 *         description: Rate limit exceeded
 */
export async function POST(request: NextRequest) {
  // Rate limit by IP
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rl = checkRateLimit(`admin-promote:${ip}`, RATE_LIMIT.admin);
  if (!rl.allowed) {
    return errorResponse("Too many requests", 429);
  }

  // Validate input
  const body: unknown = await request.json().catch(() => null);
  const parsed = promoteUserSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  // Require authenticated admin
  const user = await getAuthenticatedUser();
  const auth = requireAuth(user);
  if (!auth.ok) return errorResponse(auth.error, auth.status);

  const admin = requireAdmin(auth.user);
  if (!admin.ok) return errorResponse(admin.error, admin.status);

  // Call service
  const result = await promoteUserToAdmin(admin.user, parsed.data.userId);

  if (!result.success) {
    return errorResponse(result.error, result.status);
  }

  return successResponse(result.data);
}
