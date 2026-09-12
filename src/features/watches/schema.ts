import * as z from "zod";

// ── History window ──────────────────────────────────────────────────────────

/**
 * `?days=` bounds for `GET /api/watches/:id/history`. 365 is the ceiling
 * because a longer window is a full table scan of somebody's series for a
 * sparkline that draws six bars.
 */
export const HISTORY_DAYS = { min: 1, max: 365, default: 30 } as const;

/** Clamp rather than reject: an out-of-range window is a UI bug, not an attack. */
export function clampHistoryDays(days: number | undefined | null): number {
  if (days == null || !Number.isFinite(days)) return HISTORY_DAYS.default;
  return Math.min(HISTORY_DAYS.max, Math.max(HISTORY_DAYS.min, Math.trunc(days)));
}

/**
 * A non-numeric `days` is still a 400 — that is a malformed request, and
 * silently treating "abc" as 30 hides a broken caller.
 */
export const watchHistoryQuerySchema = z.object({
  days: z.coerce
    .number()
    .optional()
    .transform((value) => clampHistoryDays(value)),
});

export type WatchHistoryQuery = z.infer<typeof watchHistoryQuerySchema>;

// ── Create ──────────────────────────────────────────────────────────────────

/**
 * The ONLY thing a client may send when starting a watch. No price, no name, no
 * image, no user id: the server re-extracts and re-prices the product itself,
 * and every stored figure comes from `calculatePricing`. Anything else here
 * would be a number the customer could choose.
 */
export const createWatchSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, "Paste a product link to watch")
    .max(2048, "That link is too long"),
});

export type CreateWatchInput = z.infer<typeof createWatchSchema>;

// ── Params ──────────────────────────────────────────────────────────────────

export const watchIdSchema = z.uuid("Unknown watch");
