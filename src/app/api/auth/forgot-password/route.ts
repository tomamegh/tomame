import { NextRequest } from "next/server";
import { forgotPasswordSchema } from "@/features/auth/auth.validators";
import { forgotPassword } from "@/features/auth/auth.service";
import { successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request password reset email
 *     description: Sends a password reset link to the given email. Always returns success to prevent email enumeration.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: Reset email sent (or silently ignored if email not found)
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       429:
 *         description: Rate limit exceeded
 */
export async function POST(request: NextRequest) {
  // Rate limit by IP
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rl = checkRateLimit(`forgot-password:${ip}`, RATE_LIMIT.auth);
  if (!rl.allowed) {
    return errorResponse("Too many requests", 429);
  }

  // Validate input
  const body: unknown = await request.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  // Call service — always returns success to prevent email enumeration
  const result = await forgotPassword(parsed.data.email);

  if (!result.success) {
    return errorResponse(result.error, result.status);
  }

  return successResponse(result.data);
}
