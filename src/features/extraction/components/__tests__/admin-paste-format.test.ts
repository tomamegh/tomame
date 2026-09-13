import { describe, expect, it } from "vitest";

import {
  canRereadPaste,
  formatAttempts,
  formatRate,
  pasteStatusLabel,
  pasteStatusTone,
  rereadBlockedReason,
  summarisePasteCoverage,
  summarisePasteHosts,
  type AdminPasteView,
} from "../admin-paste-format";

/**
 * The host grouping is the number this whole screen exists to show, so it is the
 * part with tests: an admin decides where engineering effort goes from it, and a
 * miscount here would send that effort at the wrong store.
 */

const AMAZON = "https://www.amazon.com/dp/B0TEST";
const WALMART = "https://www.walmart.com/ip/123";
const OBSCURE = "https://shop.example.org/item/9";

describe("summarisePasteHosts", () => {
  it("counts outcomes per host and strips www", () => {
    const [first] = summarisePasteHosts([
      { product_url: AMAZON, status: "ready" },
      { product_url: AMAZON, status: "failed" },
      { product_url: AMAZON, status: "pending" },
    ]);

    expect(first?.host).toBe("amazon.com");
    expect(first).toMatchObject({ read: 1, failed: 1, unfinished: 1, total: 3 });
  });

  it("names the registered store, and says so when there is none", () => {
    const summaries = summarisePasteHosts([
      { product_url: AMAZON, status: "failed" },
      { product_url: OBSCURE, status: "failed" },
    ]);

    const amazon = summaries.find((s) => s.host === "amazon.com");
    const other = summaries.find((s) => s.host === "shop.example.org");

    expect(amazon?.store_name).toBe("Amazon");
    expect(amazon?.store_status).toBe("live");
    expect(other?.store_name).toBeNull();
    expect(other?.store_status).toBeNull();
  });

  it("rates failures against finished jobs only", () => {
    const [only] = summarisePasteHosts([
      { product_url: WALMART, status: "failed" },
      { product_url: WALMART, status: "ready" },
      { product_url: WALMART, status: "ready" },
      // Still in flight — it has not earned a place in the rate either way.
      { product_url: WALMART, status: "running" },
    ]);

    expect(only?.failure_rate).toBeCloseTo(1 / 3);
  });

  it("reports no rate at all for a host where nothing has finished", () => {
    const [only] = summarisePasteHosts([{ product_url: WALMART, status: "pending" }]);
    expect(only?.failure_rate).toBeNull();
  });

  it("orders by failures, not by rate — the work is where the volume is", () => {
    const summaries = summarisePasteHosts([
      // One paste, one failure: a 100% rate on a sample of one.
      { product_url: OBSCURE, status: "failed" },
      // Four failures out of six: a lower rate, far more customers affected.
      ...Array.from({ length: 4 }, () => ({ product_url: WALMART, status: "failed" as const })),
      ...Array.from({ length: 2 }, () => ({ product_url: WALMART, status: "ready" as const })),
    ]);

    expect(summaries.map((s) => s.host)).toEqual(["walmart.com", "shop.example.org"]);
  });

  it("breaks ties alphabetically so the table does not shuffle between renders", () => {
    const summaries = summarisePasteHosts([
      { product_url: "https://zzz.example.com/a", status: "failed" },
      { product_url: "https://aaa.example.com/a", status: "failed" },
    ]);

    expect(summaries.map((s) => s.host)).toEqual(["aaa.example.com", "zzz.example.com"]);
  });

  it("has nothing to say about an empty window", () => {
    expect(summarisePasteHosts([])).toEqual([]);
  });
});

describe("summarisePasteCoverage", () => {
  it("counts the window and rates reads against finished jobs", () => {
    const coverage = summarisePasteCoverage([
      { product_url: AMAZON, status: "ready" },
      { product_url: WALMART, status: "ready" },
      { product_url: WALMART, status: "ready" },
      { product_url: OBSCURE, status: "failed" },
      { product_url: OBSCURE, status: "running" },
    ]);

    expect(coverage).toEqual({ read: 3, failed: 1, unfinished: 1, finished: 4, read_rate: 0.75 });
  });

  it("refuses to invent a rate when nothing has finished", () => {
    expect(summarisePasteCoverage([{ product_url: AMAZON, status: "pending" }]).read_rate).toBeNull();
  });
});

describe("formatRate", () => {
  it("renders a percentage", () => {
    expect(formatRate(0.444)).toBe("44%");
    expect(formatRate(1)).toBe("100%");
    expect(formatRate(0)).toBe("0%");
  });

  it("shows a dash rather than a nought it has not earned", () => {
    expect(formatRate(null)).toBe("—");
    expect(formatRate(Number.NaN)).toBe("—");
  });
});

describe("formatAttempts", () => {
  it("gets the plural right", () => {
    expect(formatAttempts(1)).toBe("1 try");
    expect(formatAttempts(3)).toBe("3 tries");
    expect(formatAttempts(0)).toBe("0 tries");
  });
});

describe("pasteStatusLabel / pasteStatusTone", () => {
  it("separates a job that is reading from one whose worker died", () => {
    expect(pasteStatusLabel("running", false)).toBe("Reading");
    expect(pasteStatusLabel("running", true)).toBe("Stalled");
    expect(pasteStatusTone("running", false)).toBe("muted");
    expect(pasteStatusTone("running", true)).toBe("amber");
  });

  it("spends amber only where a person owes somebody an action", () => {
    expect(pasteStatusTone("failed")).toBe("amber");
    expect(pasteStatusTone("pending")).toBe("muted");
    expect(pasteStatusTone("ready")).toBe("green");
  });
});

describe("canRereadPaste", () => {
  const base: Pick<AdminPasteView, "status" | "assisted"> = { status: "failed", assisted: null };

  it("offers a re-read on a job that gave up", () => {
    expect(canRereadPaste(base)).toBe(true);
    expect(rereadBlockedReason(base)).toBeNull();
  });

  it("refuses one already in hand, because the claim would be refused anyway", () => {
    expect(canRereadPaste({ ...base, status: "running" })).toBe(false);
    expect(canRereadPaste({ ...base, status: "pending" })).toBe(false);
    expect(rereadBlockedReason({ ...base, status: "running" })).toMatch(/worker/i);
  });

  it("refuses one the customer has already escaped to a buyer", () => {
    const escaped = {
      ...base,
      assisted: { id: "a1", status: "open" as const, created_at: "2026-09-13T10:00:00Z" },
    };
    expect(canRereadPaste(escaped)).toBe(false);
    expect(rereadBlockedReason(escaped)).toMatch(/buyer/i);
  });
});
