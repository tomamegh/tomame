import { NextRequest } from "next/server";
import { loginSchema } from "@/features/auth/auth.validators";
import { login } from "@/features/auth/auth.service";
import { successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in
 *     description: Authenticates a user and returns session tokens. Rate limited to 10 requests per 15 minutes per IP.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 example: MySecurePass123
 *     responses:
 *       200:
 *         description: Login successful, returns session data
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Invalid credentials
 *       429:
 *         description: Rate limit exceeded
 */
export async function POST(request: NextRequest) {
  // Rate limit by IP
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rl = checkRateLimit(`login:${ip}`, RATE_LIMIT.auth);
  if (!rl.allowed) {
    return errorResponse("Too many requests", 429);
  }

  // Validate input
  const body: unknown = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  // Call service
  const result = await login(parsed.data.email, parsed.data.password);

  if (!result.success) {
    return errorResponse(result.error, result.status);
  }

  return successResponse(result.data);
}
