export const RATE_LIMIT = {
  /** Auth endpoints (signup, login, forgot-password) */
  auth: { windowMs: 15 * 60 * 1000, maxRequests: 10 },
  /** Admin endpoints */
  admin: { windowMs: 15 * 60 * 1000, maxRequests: 20 },
  /** Order creation — 5 requests per hour per user */
  orders: { windowMs: 60 * 60 * 1000, maxRequests: 5 },
  /** Payment initialization — 10 requests per 15 minutes */
  payments: { windowMs: 15 * 60 * 1000, maxRequests: 10 },
  /** Webhook endpoints — 100 requests per minute */
  webhooks: { windowMs: 60 * 1000, maxRequests: 100 },
} as const;

export const PASSWORD = {
  minLength: 8,
} as const;
