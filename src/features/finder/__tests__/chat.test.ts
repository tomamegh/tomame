import { describe, expect, it } from "vitest";

import { chatTitle, MAX_SEARCHES_PER_TURN, parseChatTurn, recentHistory, summariseChatRuns } from "../chat";
import { chatItemsLine } from "../chat-format";
import type { FinderEvent } from "../types";

const search = (product: string, over: Record<string, unknown> = {}) => ({
  product,
  search_query: product,
  must_haves: [],
  budget_ghs: null,
  category: null,
  ...over,
});

describe("parseChatTurn", () => {
  it("keeps one search per item the customer named", () => {
    const turn = parseChatTurn({
      reply: "Searching for both now.",
      searches: [search("iPhone 17 Pro", { must_haves: ["unlocked"], search_query: "iPhone 17 Pro unlocked" }), search("Desktop monitor")],
    });
    expect(turn?.searches.map((s) => s.product)).toEqual(["iPhone 17 Pro", "Desktop monitor"]);
    expect(turn?.searches[0]).toMatchObject({ mustHaves: ["unlocked"], newOnly: true });
  });

  it("drops repeats and searches that do not fit, and caps a turn", () => {
    const turn = parseChatTurn({
      reply: "On it.",
      searches: [search("AirPods Pro 3"), search("AirPods Pro 3"), search("x"), ...Array.from({ length: 6 }, (_, i) => search(`Item ${i}`))],
    });
    expect(turn?.searches).toHaveLength(MAX_SEARCHES_PER_TURN);
    expect(turn?.searches[0]?.product).toBe("AirPods Pro 3");
    expect(turn?.searches.filter((s) => s.product === "AirPods Pro 3")).toHaveLength(1);
  });

  it("allows a question with no searches, and rejects output that is not a turn", () => {
    expect(parseChatTurn({ reply: "What size of monitor?", searches: [] })).toEqual({ reply: "What size of monitor?", searches: [] });
    expect(parseChatTurn({ reply: 3 })).toBeNull();
    expect(parseChatTurn({ reply: "", searches: [] })).toBeNull();
  });
});

describe("chatTitle", () => {
  it("keeps a short request and trims a long one at a word", () => {
    expect(chatTitle("  cheapest iphone 17 pro  ")).toBe("cheapest iphone 17 pro");
    const long = chatTitle("Can you get me the cheapest iphone 17 pro and also a desktop monitor you can find for my office at home please");
    expect(long.length).toBeLessThanOrEqual(81);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("summariseChatRuns", () => {
  it("gives the model each item's state and the landed totals as calculated", () => {
    const events: FinderEvent[] = [
      { type: "run_started", at: 0, query: "iPhone 17 Pro", budgetGhs: null },
      { type: "spec_parsed", at: 1, spec: { product: "iPhone 17 Pro", mustHaves: [], budgetGhs: null, newOnly: true } },
      {
        type: "candidate_found",
        at: 2,
        candidate: { id: "c1", title: "Apple iPhone 17 Pro 256GB Unlocked", store: { id: "ebay", name: "eBay" }, productUrl: "u", imageUrl: null, condition: "New", listingPriceUsd: 1099, seller: null },
      },
      { type: "candidate_priced", at: 3, candidateId: "c1", quote: { totalGhs: 16500, totalUsd: 1340, exchangeRate: 12.3, rows: [] }, stockCheck: false },
      { type: "result_ready", at: 4, bestId: "c1", alternativeIds: [], why: {} },
    ];
    const text = summariseChatRuns([
      { id: "r1", query: "iPhone 17 Pro", status: "done", events },
      { id: "r2", query: "Desktop monitor", status: "running", events: [] },
    ]);
    expect(text).toContain("iPhone 17 Pro:");
    expect(text).toContain("Apple iPhone 17 Pro 256GB Unlocked at eBay, GH₵16,500.00 landed in Accra");
    expect(text).toContain("Desktop monitor: still searching.");
    expect(summariseChatRuns([])).toBeNull();
  });
});

describe("recentHistory", () => {
  it("starts on a customer message", () => {
    const msgs = [{ role: "assistant" as const }, { role: "user" as const }, { role: "assistant" as const }];
    expect(recentHistory(msgs, 3)[0]?.role).toBe("user");
  });
});

describe("chatItemsLine", () => {
  it("says what each search found", () => {
    expect(
      chatItemsLine([
        { product: "iPhone 17 Pro", status: "done", totalGhs: 16500, imageUrl: null },
        { product: "Monitor", status: "running", totalGhs: null, imageUrl: null },
        { product: "Kettle", status: "no_match", totalGhs: null, imageUrl: null },
      ]),
    ).toBe("iPhone 17 Pro · GH₵16,500.00  ·  Monitor · searching  ·  Kettle · not found");
    expect(chatItemsLine([])).toBeNull();
  });
});
