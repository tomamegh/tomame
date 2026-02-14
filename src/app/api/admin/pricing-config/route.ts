import { NextRequest } from "next/server";
import { updatePricingConfigSchema } from "@/features/pricing/pricing.validators";
import { getAll, updateRegionPricing } from "@/features/pricing/pricing.service";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { successResponse, errorResponse } from "@/lib/auth/api-helpers";
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
  // Require authenticated admin
  const user = await getAuthenticatedUser();
  const auth = requireAuth(user);
  if (!auth.ok) return errorResponse(auth.error, auth.status);

  const admin = requireAdmin(auth.user);
  if (!admin.ok) return errorResponse(admin.error, admin.status);

  const result = await getAll();

  if (!result.success) {
    return errorResponse(result.error, result.status);
  }

  return successResponse(result.data);
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
  // Rate limit by IP
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rl = checkRateLimit(`admin-pricing:${ip}`, RATE_LIMIT.admin);
  if (!rl.allowed) {
    return errorResponse("Too many requests", 429);
  }

  // Validate input
  const body: unknown = await request.json().catch(() => null);
  const parsed = updatePricingConfigSchema.safeParse(body);
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
  const result = await updateRegionPricing(
    admin.user,
    parsed.data.region,
    parsed.data.baseShippingFeeUsd,
    parsed.data.exchangeRate,
    parsed.data.serviceFeePercentage
  );

  if (!result.success) {
    return errorResponse(result.error, result.status);
  }

  return successResponse(result.data);
}
