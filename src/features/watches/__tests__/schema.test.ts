import { describe, it, expect } from "vitest";

import {
  HISTORY_DAYS,
  clampHistoryDays,
  createWatchSchema,
  watchHistoryQuerySchema,
  watchIdSchema,
} from "../schema";

describe("createWatchSchema", () => {
  it("accepts a URL and nothing else", () => {
    const parsed = createWatchSchema.parse({ url: "  https://www.amazon.com/dp/B0CHX1W1XY  " });
    expect(parsed).toEqual({ url: "https://www.amazon.com/dp/B0CHX1W1XY" });
  });

  it("strips any price, name or user id a caller tries to smuggle in", () => {
    const parsed = createWatchSchema.parse({
      url: "https://www.amazon.com/dp/B0CHX1W1XY",
      baseline_price_usd: 1,
      user_id: "someone-else",
      total_ghs: 1,
    });
    expect(parsed).toEqual({ url: "https://www.amazon.com/dp/B0CHX1W1XY" });
  });

  it("rejects an empty or oversized link", () => {
    expect(createWatchSchema.safeParse({ url: "   " }).success).toBe(false);
    expect(createWatchSchema.safeParse({ url: `https://x.com/${"a".repeat(2100)}` }).success).toBe(false);
  });
});

describe("watchHistoryQuerySchema", () => {
  it("defaults to 30 days when the caller says nothing", () => {
    expect(watchHistoryQuerySchema.parse({}).days).toBe(HISTORY_DAYS.default);
    expect(watchHistoryQuerySchema.parse({ days: undefined }).days).toBe(HISTORY_DAYS.default);
  });

  it("clamps rather than rejects an out-of-range window", () => {
    expect(watchHistoryQuerySchema.parse({ days: "9999" }).days).toBe(HISTORY_DAYS.max);
    expect(watchHistoryQuerySchema.parse({ days: "0" }).days).toBe(HISTORY_DAYS.min);
    expect(watchHistoryQuerySchema.parse({ days: "-30" }).days).toBe(HISTORY_DAYS.min);
  });

  it("coerces the query string and truncates a fractional window", () => {
    expect(watchHistoryQuerySchema.parse({ days: "7" }).days).toBe(7);
    expect(watchHistoryQuerySchema.parse({ days: "7.9" }).days).toBe(7);
  });

  it("rejects a non-numeric window — that is a broken caller, not a big number", () => {
    expect(watchHistoryQuerySchema.safeParse({ days: "thirty" }).success).toBe(false);
  });
});

describe("clampHistoryDays", () => {
  it("survives null, undefined and Infinity", () => {
    expect(clampHistoryDays(null)).toBe(HISTORY_DAYS.default);
    expect(clampHistoryDays(undefined)).toBe(HISTORY_DAYS.default);
    expect(clampHistoryDays(Number.POSITIVE_INFINITY)).toBe(HISTORY_DAYS.default);
    expect(clampHistoryDays(Number.NaN)).toBe(HISTORY_DAYS.default);
  });
});

describe("watchIdSchema", () => {
  it("accepts a uuid and refuses anything else", () => {
    expect(watchIdSchema.safeParse("11111111-1111-4111-8111-111111111111").success).toBe(true);
    expect(watchIdSchema.safeParse("../../etc/passwd").success).toBe(false);
  });
});
