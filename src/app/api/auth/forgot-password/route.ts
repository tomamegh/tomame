import { NextRequest } from "next/server";
import { forgotPasswordSchema } from "@/features/auth/auth.validators";
import { forgotPassword } from "@/features/auth/services/auth.service";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
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
  try {
    // Rate limit by IP
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`forgot-password:${ip}`, RATE_LIMIT.auth).allowed) {
      throw new APIError(429, "Too many requests");
    }

    // Validate input
    const body: unknown = await request.json().catch(() => { throw new APIError(400, "Invalid JSON"); });
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    // Call service — always returns success to prevent email enumeration
    const result = await forgotPassword(parsed.data.email);
    if (!result.success) throw new APIError(result.status, result.error);

    return successResponse(result.data);
  } catch (error) {
    return errorResponse(error);
  }
}
