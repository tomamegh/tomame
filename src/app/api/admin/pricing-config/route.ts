import { NextRequest } from "next/server";
import { updatePricingConfigSchema } from "@/features/pricing/pricing.validators";
import { getAll, updateRegionPricing } from "@/features/pricing/pricing.service";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * @swagger
 * /api/admin/pricing-config:
 *   get:
 *     tags: [Admin]
 *     summary: Get all pricing configs
 *     description: Returns pricing configuration for all regions. Requires admin role.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pricing configs for all regions
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 */
export async function GET() {
  try {
    // Require authenticated admin
    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    if (!auth.ok) throw new APIError(auth.status, auth.error);

    const admin = requireAdmin(auth.user);
    if (!admin.ok) throw new APIError(admin.status, admin.error);

    const result = await getAll();
    if (!result.success) throw new APIError(result.status, result.error);

    return successResponse(result.data);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * @swagger
 * /api/admin/pricing-config:
 *   put:
 *     tags: [Admin]
 *     summary: Update pricing config for a region
 *     description: Updates the pricing configuration (shipping fee, exchange rate, service fee) for a specific region. Requires admin role.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [region, baseShippingFeeUsd, exchangeRate, serviceFeePercentage]
 *             properties:
 *               region:
 *                 type: string
 *                 enum: [USA, UK, CHINA]
 *               baseShippingFeeUsd:
 *                 type: number
 *                 example: 15.00
 *               exchangeRate:
 *                 type: number
 *                 example: 14.50
 *               serviceFeePercentage:
 *                 type: number
 *                 example: 0.10
 *     responses:
 *       200:
 *         description: Pricing config updated
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
export async function PUT(request: NextRequest) {
  try {
    // Rate limit by IP
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`admin-pricing:${ip}`, RATE_LIMIT.admin).allowed) {
      throw new APIError(429, "Too many requests");
    }

    // Validate input
    const body: unknown = await request.json().catch(() => { throw new APIError(400, "Invalid JSON"); });
    const parsed = updatePricingConfigSchema.safeParse(body);
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
    const result = await updateRegionPricing(
      admin.user,
      parsed.data.region,
      parsed.data.baseShippingFeeUsd,
      parsed.data.exchangeRate,
      parsed.data.serviceFeePercentage
    );
    if (!result.success) throw new APIError(result.status, result.error);

    return successResponse(result.data);
  } catch (error) {
    return errorResponse(error);
  }
}
