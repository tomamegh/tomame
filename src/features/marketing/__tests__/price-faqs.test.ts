import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/exchange-rates/service", () => ({ getGhsRate: vi.fn(), getAllRates: vi.fn() }));

import { withPriceFaqs } from "../services/marketing-content.service";
import type { SiteContentRow } from "@/db/queries/site-content";

const row = (slug: string, title: string): SiteContentRow => ({
  id: slug,
  kind: "faq",
  slug,
  locale: "en",
  title,
  body: "…",
  data: {},
  sort_order: 1,
});

describe("withPriceFaqs", () => {
  it("leads with the two price questions, word for word", () => {
    const faqs = withPriceFaqs([row("mobile-money", "Can I pay with Mobile Money?")]);
    expect(faqs.map((f) => f.title)).toEqual([
      "Will I pay customs on delivery?",
      "How much is the Tomame fee?",
      "Can I pay with Mobile Money?",
    ]);
  });

  it("replaces an admin row with the same slug instead of letting it drift", () => {
    const faqs = withPriceFaqs([row("tomame-fee", "How much is the fee? (old)")]);
    expect(faqs.filter((f) => f.slug === "tomame-fee")).toHaveLength(1);
    expect(faqs.find((f) => f.slug === "tomame-fee")?.title).toBe("How much is the Tomame fee?");
  });
});
