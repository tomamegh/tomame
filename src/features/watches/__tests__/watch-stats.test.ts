import { describe, it, expect } from "vitest";

import {
  SPARKLINE_BARS,
  buildSparkline,
  deriveWatchStats,
  emptyWatchStats,
  formatUsd,
} from "../services/watch-stats";
import type { PriceObservation } from "../types";

/**
 * `watch-stats` is the one piece of Phase 2 that can be wrong without anything
 * looking broken: a fabricated delta renders beautifully. So every rule gets a
 * case, `now` is injected, and the FX-versus-real-price-drop distinction is
 * tested in both directions.
 */

const NOW = new Date("2026-09-12T06:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function obs(
  daysAgo: number,
  priceUsd: number,
  extra: { rate?: number; ghs?: number } = {},
): PriceObservation {
  const rate = extra.rate ?? 15;
  return {
    price_usd: priceUsd,
    total_ghs: extra.ghs ?? priceUsd * rate,
    exchange_rate: rate,
    observed_at: new Date(NOW.getTime() - daysAgo * DAY_MS).toISOString(),
  };
}

function stats(observations: PriceObservation[]) {
  return deriveWatchStats(observations, { now: NOW });
}

describe("deriveWatchStats — no trend yet", () => {
  it("returns the empty shape for a watch with no observations", () => {
    const s = stats([]);
    expect(s).toEqual(emptyWatchStats());
    expect(s.observation_count).toBe(0);
    expect(s.has_trend).toBe(false);
    expect(s.delta_label).toBeNull();
    expect(s.status_label).toBe("not checked yet");
    expect(s.sparkline).toBeNull();
  });

  it("does not invent a delta or a flat line from a single observation", () => {
    const s = stats([obs(0, 349)]);
    expect(s.observation_count).toBe(1);
    expect(s.has_trend).toBe(false);
    expect(s.direction).toBe("unknown");
    expect(s.basis).toBe("none");
    expect(s.delta_usd).toBeNull();
    expect(s.delta_pct).toBeNull();
    expect(s.delta_ghs).toBeNull();
    expect(s.delta_label).toBeNull();
    expect(s.status_label).toBe("no change yet");
    expect(s.sparkline).toBeNull();
  });

  it("still reports the current figures from a single observation", () => {
    const s = stats([obs(0, 349, { rate: 14.43 })]);
    expect(s.current_price_usd).toBe(349);
    expect(s.current_total_ghs).toBeCloseTo(349 * 14.43, 6);
    expect(s.current_exchange_rate).toBe(14.43);
    expect(s.low_30d_usd).toBe(349);
    expect(s.is_lowest_in_30d).toBe(false);
  });

  it("drops readings with an unparseable date or a non-finite price", () => {
    const s = stats([
      { price_usd: Number.NaN, total_ghs: 10, exchange_rate: 15, observed_at: NOW.toISOString() },
      { price_usd: 100, total_ghs: 1500, exchange_rate: 15, observed_at: "not a date" },
      obs(0, 200),
    ]);
    expect(s.observation_count).toBe(1);
    expect(s.current_price_usd).toBe(200);
  });
});

describe("deriveWatchStats — the 7-day delta", () => {
  it('reads "↓ $150 this week" off the series', () => {
    // A lower price 20 days ago keeps the latest reading off the 30-day low, so
    // the label takes its money form rather than the percentage one.
    const s = stats([obs(20, 300), obs(9, 500), obs(8, 350)]);
    expect(s.has_trend).toBe(true);
    expect(s.basis).toBe("7d");
    expect(s.direction).toBe("drop");
    expect(s.delta_usd).toBe(-150);
    expect(s.delta_label).toBe("↓ $150 this week");
  });

  it("measures against the most recent reading that is at least a week old", () => {
    // 9 days ago is the reference; 3 days ago is inside the week and ignored.
    const s = stats([obs(20, 300), obs(9, 500), obs(3, 460), obs(0, 450)]);
    expect(s.basis).toBe("7d");
    expect(s.delta_usd).toBe(-50);
  });

  it("falls back to the oldest reading, and says so, when the watch is younger than a week", () => {
    const s = stats([obs(3, 400), obs(1, 460)]);
    expect(s.basis).toBe("since_start");
    expect(s.direction).toBe("rise");
    expect(s.delta_usd).toBe(60);
    expect(s.delta_label).toBe("↑ $60 since you started watching");
  });

  it("never compares the latest reading against itself when the whole series is stale", () => {
    // Both readings predate the cutoff: the reference must still be the older one.
    const s = stats([obs(25, 500), obs(20, 400)]);
    expect(s.delta_usd).toBe(-100);
    expect(s.direction).toBe("drop");
  });

  it('reports "no change" for a genuinely flat series', () => {
    const s = stats([obs(9, 250), obs(0, 250)]);
    expect(s.has_trend).toBe(true);
    expect(s.direction).toBe("flat");
    expect(s.delta_usd).toBe(0);
    expect(s.delta_label).toBe("no change");
    expect(s.status_label).toBe("no change");
  });

  it("sorts an out-of-order series before deriving anything", () => {
    const s = stats([obs(8, 350), obs(20, 300), obs(9, 500)]);
    expect(s.current_price_usd).toBe(350);
    expect(s.delta_usd).toBe(-150);
  });
});

describe("deriveWatchStats — lowest in 30 days", () => {
  it('uses the percentage form when the drop is also the 30-day low', () => {
    const s = stats([obs(10, 100), obs(8, 78)]);
    expect(s.is_lowest_in_30d).toBe(true);
    expect(s.low_30d_usd).toBe(78);
    expect(s.delta_pct).toBeCloseTo(-0.22, 10);
    expect(s.delta_label).toBe("↓ 22% · lowest in 30 days");
  });

  it("is false when an earlier reading in the window was cheaper", () => {
    const s = stats([obs(20, 300), obs(9, 500), obs(8, 350)]);
    expect(s.is_lowest_in_30d).toBe(false);
    expect(s.low_30d_usd).toBe(300);
  });

  it("is false for a flat series — every reading is trivially the lowest", () => {
    const s = stats([obs(20, 250), obs(9, 250), obs(0, 250)]);
    expect(s.is_lowest_in_30d).toBe(false);
  });

  it("ignores readings older than 30 days", () => {
    // $200 is the cheapest ever seen but it is 40 days old, so today's $350 is
    // still the 30-day low.
    const s = stats([obs(40, 200), obs(9, 500), obs(8, 350)]);
    expect(s.low_30d_usd).toBe(350);
    expect(s.is_lowest_in_30d).toBe(true);
  });

  it("falls back to the latest reading when the whole series is older than 30 days", () => {
    const s = stats([obs(60, 500), obs(45, 400)]);
    expect(s.low_30d_usd).toBe(400);
    expect(s.is_lowest_in_30d).toBe(false);
  });
});

describe("deriveWatchStats — cedi movement is not a price cut", () => {
  it("reports no price change when only the exchange rate moved", () => {
    // Same $300 sticker both weeks; the cedi strengthened 15.00 → 12.00, so the
    // GH₵ figure fell by 900. That is an FX move, not a discount.
    const s = stats([obs(9, 300, { rate: 15 }), obs(1, 300, { rate: 12 })]);
    expect(s.direction).toBe("flat");
    expect(s.delta_usd).toBe(0);
    expect(s.delta_label).toBe("no change");
    expect(s.is_lowest_in_30d).toBe(false);
    expect(s.delta_ghs).toBe(-900);
    expect(s.exchange_rate_changed).toBe(true);
  });

  it("still reports a real price drop when the cedi weakened enough to raise the GH₵ total", () => {
    // $400 → $300 (a genuine cut) while the rate went 12.00 → 17.00, so GH₵
    // 4,800 → 5,100 went UP. The headline must follow the USD.
    const s = stats([obs(9, 400, { rate: 12 }), obs(1, 300, { rate: 17 })]);
    expect(s.direction).toBe("drop");
    expect(s.delta_usd).toBe(-100);
    expect(s.delta_ghs).toBe(300);
    expect(s.exchange_rate_changed).toBe(true);
    expect(s.delta_label).toBe("↓ 25% · lowest in 30 days");
  });

  it("flags a steady rate as unchanged", () => {
    const s = stats([obs(9, 400), obs(1, 380)]);
    expect(s.exchange_rate_changed).toBe(false);
  });

  it("normalises the sparkline from USD, so an FX-only move draws a flat line", () => {
    const s = stats([
      obs(20, 300, { rate: 11 }),
      obs(12, 300, { rate: 14 }),
      obs(4, 300, { rate: 18 }),
    ]);
    expect(s.sparkline?.bars).toEqual([60, 60, 60]);
    expect(s.sparkline?.direction).toBe("flat");
  });
});

describe("deriveWatchStats — sparkline", () => {
  it("downsamples a long series to six bars, oldest first, ending on today", () => {
    const prices = [100, 99, 98, 97, 96, 95, 94, 93, 92, 91];
    const s = stats(prices.map((p, i) => obs(prices.length - i, p)));
    expect(s.sparkline?.bars).toHaveLength(SPARKLINE_BARS);
    expect(s.sparkline?.bars).toEqual([100, 82, 64, 56, 38, 20]);
    expect(s.sparkline?.direction).toBe("drop");
  });

  it("renders only the bars it has rather than padding a short series", () => {
    const s = stats([obs(20, 400), obs(10, 300), obs(1, 350)]);
    expect(s.sparkline?.bars).toEqual([100, 20, 60]);
  });

  it("colours the last bar by the headline direction", () => {
    const dropping = stats([obs(20, 300), obs(9, 500), obs(8, 350)]);
    expect(dropping.sparkline?.direction).toBe("drop");

    const rising = stats([obs(9, 300), obs(1, 360)]);
    expect(rising.sparkline?.direction).toBe("rise");

    const flat = stats([obs(9, 300), obs(1, 300)]);
    expect(flat.sparkline?.direction).toBe("flat");
  });
});

describe("buildSparkline", () => {
  it("returns null for fewer than two points — one price is not a shape", () => {
    expect(buildSparkline([], "unknown")).toBeNull();
    expect(buildSparkline([12], "flat")).toBeNull();
  });

  it("puts the cheapest point on the floor and the dearest on the ceiling", () => {
    const line = buildSparkline([10, 20], "rise");
    expect(line?.bars).toEqual([20, 100]);
  });

  it("uses one constant height when every point is identical", () => {
    expect(buildSparkline([7, 7, 7], "flat")?.bars).toEqual([60, 60, 60]);
  });

  it("always keeps the newest point as the final bar when downsampling", () => {
    const line = buildSparkline([1, 9, 9, 9, 9, 9, 9, 1], "drop");
    expect(line?.bars).toHaveLength(SPARKLINE_BARS);
    expect(line?.bars.at(-1)).toBe(20);
    expect(line?.bars[0]).toBe(20);
  });
});

describe("formatUsd", () => {
  it("rounds to whole dollars above a dollar", () => {
    expect(formatUsd(150)).toBe("$150");
    expect(formatUsd(150.4)).toBe("$150");
    expect(formatUsd(1299)).toBe("$1,299");
  });

  it("keeps cents for a sub-dollar move", () => {
    expect(formatUsd(0.5)).toBe("$0.50");
    expect(formatUsd(0.04)).toBe("$0.04");
  });

  it("is used verbatim in the label", () => {
    expect(stats([obs(9, 10), obs(8, 10.5)]).delta_label).toBe("↑ $0.50 this week");
    expect(stats([obs(9, 1000), obs(8, 2299)]).delta_label).toBe("↑ $1,299 this week");
  });
});
