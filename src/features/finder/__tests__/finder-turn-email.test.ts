import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { app: { url: "https://tomame.test" } } }));

import { finderTurnTemplate, itemsPhrase } from "../email/finder-result-email";
import type { FinderCandidateState } from "../types";

const candidate = (id: string, title: string, total: number): FinderCandidateState => ({
  id,
  title,
  store: { id: "amazon", name: "Amazon" },
  productUrl: `https://www.amazon.com/dp/${id}`,
  imageUrl: null,
  condition: "New",
  listingPriceUsd: 100,
  seller: null,
  status: "priced",
  quote: { totalGhs: total, totalUsd: total / 12, exchangeRate: 12, rows: [{ key: "item", label: "Item", amountGhs: total }] },
  stockCheck: false,
  why: null,
});

describe("finderTurnTemplate", () => {
  it("names the item, not the sentence, when one thing was asked for", () => {
    const mail = finderTurnTemplate({
      items: [{ product: "iPhone 17 Pro, unlocked", best: candidate("a", "Apple iPhone 17 Pro 256GB Unlocked", 16500), alternatives: [], nothingMessage: null }],
      chatUrl: "https://tomame.test/app/find/chat/1",
      buyerHref: null,
    });
    expect(mail.subject).toBe("Best price for iPhone 17 Pro, unlocked: GH₵16,500.00 landed");
  });

  it("covers every item in one email, including one we could not find", () => {
    const mail = finderTurnTemplate({
      items: [
        { product: "iPhone 17 Pro", best: candidate("a", "Apple iPhone 17 Pro 256GB Unlocked", 16500), alternatives: [], nothingMessage: null },
        { product: "Desktop monitor", best: null, alternatives: [], nothingMessage: "No new monitor matched." },
      ],
      chatUrl: "https://tomame.test/app/find/chat/1",
      buyerHref: "https://wa.me/233594424746",
    });
    expect(mail.subject).toBe("Your prices for iPhone 17 Pro and Desktop monitor");
    expect(mail.html).toContain("Apple iPhone 17 Pro 256GB Unlocked");
    expect(mail.html).toContain("No new monitor matched.");
    expect(mail.html).toContain("Ask a buyer on WhatsApp");
  });
});

describe("itemsPhrase", () => {
  it("lists two and counts the rest", () => {
    expect(itemsPhrase(["A"])).toBe("A");
    expect(itemsPhrase(["A", "B"])).toBe("A and B");
    expect(itemsPhrase(["A", "B", "C", "D"])).toBe("A, B and 2 more");
  });
});
