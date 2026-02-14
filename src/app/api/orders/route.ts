import { NextRequest } from "next/server";
import { createOrderSchema } from "@/features/orders/orders.validators";
import { createOrder, listUserOrders } from "@/features/orders/orders.service";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";

/**
 * @swagger
 * /api/orders:
 *   post:
 *     tags: [Orders]
 *     summary: Create a new order
 *     description: Submit a product quote. Server calculates pricing from admin-configured rates. Rate limited to 5 per hour.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productUrl, productName, estimatedPriceUsd, originCountry]
 *             properties:
 *               productUrl:
 *                 type: string
 *                 format: uri
 *                 example: https://www.amazon.com/dp/B09V3KXJPB
 *               productName:
 *                 type: string
 *                 example: Sony WH-1000XM5 Headphones
 *               productImageUrl:
 *                 type: string
 *                 format: uri
 *               estimatedPriceUsd:
 *                 type: number
 *                 example: 298
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 default: 1
 *               originCountry:
 *                 type: string
 *                 enum: [USA, UK, CHINA]
 *               specialInstructions:
 *                 type: string
 *     responses:
 *       201:
 *         description: Order created with pricing breakdown
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Not authenticated
 *       429:
 *         description: Rate limit exceeded
 */
export async function POST(request: NextRequest) {
  // Rate limit by IP
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rl = checkRateLimit(`orders-create:${ip}`, RATE_LIMIT.orders);
  if (!rl.allowed) {
    return errorResponse("Too many requests", 429);
  }

  // Validate input
  const body: unknown = await request.json().catch(() => null);
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  // Require authenticated user
  const user = await getAuthenticatedUser();
  const auth = requireAuth(user);
  if (!auth.ok) {
    return errorResponse(auth.error, auth.status);
  }

  // Call service — user ID comes from verified session, never from client
  const result = await createOrder(auth.user, {
    productUrl: parsed.data.productUrl,
    productName: parsed.data.productName,
    productImageUrl: parsed.data.productImageUrl,
    estimatedPriceUsd: parsed.data.estimatedPriceUsd,
    quantity: parsed.data.quantity,
    originCountry: parsed.data.originCountry,
    specialInstructions: parsed.data.specialInstructions,
  });

  if (!result.success) {
    return errorResponse(result.error, result.status);
  }

  return successResponse(result.data, 201);
}

/**
 * @swagger
 * /api/orders:
 *   get:
 *     tags: [Orders]
 *     summary: List user orders
 *     description: Returns all orders for the authenticated user, sorted by most recent.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of orders
 *       401:
 *         description: Not authenticated
 */
export async function GET() {
  // Require authenticated user
  const user = await getAuthenticatedUser();
  const auth = requireAuth(user);
  if (!auth.ok) {
    return errorResponse(auth.error, auth.status);
  }

  const result = await listUserOrders(auth.user);

  if (!result.success) {
    return errorResponse(result.error, result.status);
  }

  return successResponse(result.data);
}
