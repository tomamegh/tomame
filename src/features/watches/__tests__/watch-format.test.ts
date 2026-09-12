import { describe, it, expect } from "vitest";

import {
  clampBarHeight,
  directionBarClass,
  directionTextClass,
  formatLastChecked,
  formatWatchingCount,
  watchDisplayName,
  watchStoreLabel,
} from "../components/format";
import type { PriceWatch } from "../types";

/**
 * These helpers decide the two things a price card can lie about without
 * looking broken: what colour a number is, and how old it is. Green on a flat
 * watch reads as good news that did not happen, and "checked just now" on a
 * watch the daily job has never touched is worse than saying nothing.
 */

const NOW = new Date("2026-09-12T12:00:00.000Z");

function watchWith(overrides: Partial<PriceWatch> = {}): PriceWatch {
  return {
    id: "w1",
    product_url: "https://www.amazon.com/dp/B0CHWRXH8B",
    product_name: "Sony WH-1000XM5",
    product_image_url: null,
    baseline_price_usd: 349,
    baseline_total_ghs: 5041.16,
    last_price_usd: 299,
    last_total_ghs: 4400,
    last_checked_at: "2026-09-12T06:00:00.000Z",
    notify_on_drop: true,
    is_active: true,
    created_at: "2026-08-30T06:00:00.000Z",
    ...overrides,
  };
}

describe("direction colours", () => {
  it("reserves green for an actual drop", () => {
    expect(directionTextClass("drop")).toBe("text-tm-green");
    expect(directionBarClass("drop")).toBe("bg-tm-green");
  });

  it("marks a rise in coral", () => {
    expect(directionTextClass("rise")).toBe("text-tm-coral");
    expect(directionBarClass("rise")).toBe("bg-tm-coral");
  });

  it("stays neutral when nothing moved or nothing is known", () => {
    for (const direction of ["flat", "unknown"] as const) {
      expect(directionTextClass(direction)).toBe("text-tm-text-3");
      // The final bar falls back to the idle tone rather than calling out a
      // move the series does not contain.
      expect(directionBarClass(direction)).toBe(directionBarClass("flat"));
    }
  });
});

describe("clampBarHeight", () => {
  it("keeps a valid height as a whole percentage", () => {
    expect(clampBarHeight(62.4)).toBe(62);
  });

  it("clamps a wire value that would overflow its own track", () => {
    expect(clampBarHeight(140)).toBe(100);
    expect(clampBarHeight(-20)).toBe(0);
  });

  it("draws nothing rather than guessing for a non-finite value", () => {
    expect(clampBarHeight(Number.NaN)).toBe(0);
    expect(clampBarHeight(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("formatLastChecked", () => {
  it("says so plainly when the job has never checked the watch", () => {
    expect(formatLastChecked(null, NOW)).toBe("not checked yet");
  });

  it("reports the age of the last reading", () => {
    expect(formatLastChecked("2026-09-12T06:00:00.000Z", NOW)).toBe(
      "checked 6 hrs ago",
    );
    expect(formatLastChecked("2026-09-11T06:00:00.000Z", NOW)).toBe(
      "checked yesterday",
    );
  });

  it("never claims a check happened for an unreadable timestamp", () => {
    expect(formatLastChecked("not-a-date", NOW)).toBe(
      "last check time unknown",
    );
  });
});

describe("watchStoreLabel", () => {
  it("drops the www. prefix", () => {
    expect(watchStoreLabel("https://www.amazon.com/dp/B0C")).toBe("amazon.com");
  });

  it("returns null for an unparseable URL so the caller drops the line", () => {
    expect(watchStoreLabel("amazon.com/dp/B0C")).toBeNull();
  });
});

describe("watchDisplayName", () => {
  it("uses the snapshotted product name", () => {
    expect(watchDisplayName(watchWith())).toBe("Sony WH-1000XM5");
  });

  it("falls back to the store when the extraction read no title", () => {
    expect(watchDisplayName(watchWith({ product_name: "   " }))).toBe(
      "Item from amazon.com",
    );
  });

  it("still names the row when even the URL is unusable", () => {
    expect(
      watchDisplayName(watchWith({ product_name: null, product_url: "junk" })),
    ).toBe("Watched product");
  });
});

describe("formatWatchingCount", () => {
  it("counts what the customer actually watches", () => {
    expect(formatWatchingCount(2)).toBe("2 watching");
  });

  it("returns null at zero so the header drops the clause", () => {
    expect(formatWatchingCount(0)).toBeNull();
    expect(formatWatchingCount(Number.NaN)).toBeNull();
  });
});
