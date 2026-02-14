import { NextRequest } from "next/server";
import { resetPasswordSchema } from "@/features/auth/auth.validators";
import { resetPassword } from "@/features/auth/auth.service";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Set new password after reset
 *     description: Requires an active session established by the reset link callback. Sets the user's new password.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: NewSecurePass123
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Not authenticated (no valid session)
 *       429:
 *         description: Rate limit exceeded
 */
export async function POST(request: NextRequest) {
  // Rate limit by IP
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rl = checkRateLimit(`reset-password:${ip}`, RATE_LIMIT.auth);
  if (!rl.allowed) {
    return errorResponse("Too many requests", 429);
  }

  // Validate input
  const body: unknown = await request.json().catch(() => null);
  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  // Require active session (set by the reset link callback)
  const user = await getAuthenticatedUser();
  const auth = requireAuth(user);
  if (!auth.ok) {
    return errorResponse(auth.error, auth.status);
  }

  // Call service — userId comes from verified session, never from client
  const result = await resetPassword(auth.user.id, parsed.data.password);

  if (!result.success) {
    return errorResponse(result.error, result.status);
  }

  return successResponse(result.data);
}
