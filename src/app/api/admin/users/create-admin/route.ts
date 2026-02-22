import { NextRequest } from "next/server";
import { createAdminSchema } from "@/features/users/users.validators";
import { createAdminUser } from "@/features/users/users.service";
import { getAuthenticatedUser } from "@/features/auth/auth.service";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * @swagger
 * /api/admin/users/create-admin:
 *   post:
 *     tags: [Admin]
 *     summary: Create a new admin user
 *     description: Creates a new user account with admin role. Requires admin authentication.
 *     security:
 *       - bearerAuth: []
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
 *                 example: newadmin@example.com
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: AdminPass123
 *     responses:
 *       201:
 *         description: Admin user created
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
  try {
    // Rate limit by IP
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-create:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    // Validate input
    const body: unknown = await request.json().catch(() => { throw new APIError(400, "Invalid JSON"); });
    const parsed = createAdminSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    // Require authenticated admin
    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    if (!auth.ok) throw new APIError(auth.status, auth.error);

    const admin = requireAdmin(auth.user);
    if (!admin.ok) throw new APIError(admin.status, admin.error);

    // Call service
    const result = await createAdminUser(
      admin.user,
      parsed.data.email,
      parsed.data.password
    );
    if (!result.success) throw new APIError(result.status, result.error);

    return successResponse(result.data, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
