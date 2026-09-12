import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { extraction: { anthropicApiKey: "k" } } }));

const db = { getStoreCategory: vi.fn(), upsertStoreCategory: vi.fn(async () => undefined) };
vi.mock("@/db/queries/store-category-map", () => db);

const parse = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  class Anthropic {
    messages = { parse };
  }
  return { default: Anthropic };
});

import { classifyCategory, pathKey, crumbsFromText } from "../category.service";
import { TomameCategory } from "@/config/categories";

beforeEach(() => {
  db.getStoreCategory.mockReset();
  db.upsertStoreCategory.mockClear();
  parse.mockReset();
});

describe("classifyCategory", () => {
  it("answers from the static maps without touching the DB or the model", async () => {
    const r = await classifyCategory({ store: "walmart", title: "Ninja AF101 Air Fryer", breadcrumbs: ["Home", "Appliances", "Kitchen Appliances"] });
    expect(r).toEqual({ category: TomameCategory.APPLIANCES, confidence: 0.9, source: "seed" });
    expect(db.getStoreCategory).not.toHaveBeenCalled();
    expect(parse).not.toHaveBeenCalled();
  });

  it("uses the learned map before the model", async () => {
    db.getStoreCategory.mockResolvedValue({ store: "etsy", source_path: "homepage › artisan goods › tapers", tomame_category: TomameCategory.HOME_KITCHEN, source: "llm", confidence: 0.7 });
    const r = await classifyCategory({ store: "etsy", title: "Soy candle", breadcrumbs: ["Homepage", "Artisan Goods", "Tapers"] });
    expect(r?.source).toBe("map");
    expect(r?.category).toBe(TomameCategory.HOME_KITCHEN);
    expect(db.getStoreCategory).toHaveBeenCalledWith("etsy", "homepage › artisan goods › tapers");
    expect(parse).not.toHaveBeenCalled();
  });

  it("asks Haiku on a miss and writes the answer back for that store path", async () => {
    db.getStoreCategory.mockResolvedValue(null);
    parse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: { category: TomameCategory.HOME_KITCHEN, confidence: 0.82 } });
    const r = await classifyCategory({ store: "etsy", title: "Soy candle", breadcrumbs: ["Homepage", "Artisan Goods", "Tapers"] });
    expect(r).toEqual({ category: TomameCategory.HOME_KITCHEN, confidence: 0.82, source: "llm" });
    expect(parse).toHaveBeenCalledTimes(1);
    expect(parse.mock.calls[0]?.[0]).toMatchObject({ model: "claude-haiku-4-5" });
    expect(db.upsertStoreCategory).toHaveBeenCalledWith(
      expect.objectContaining({ store: "etsy", sourcePath: "homepage › artisan goods › tapers", tomameCategory: TomameCategory.HOME_KITCHEN, source: "llm" }),
    );
  });

  it("classifies from the title alone when there are no breadcrumbs, and does not cache that", async () => {
    parse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: { category: TomameCategory.SHOES_MEN, confidence: 0.85 } });
    const r = await classifyCategory({ store: "nike", title: "Nike Air Force 1 '07", breadcrumbs: [] });
    expect(r?.category).toBe(TomameCategory.SHOES_MEN);
    expect(db.getStoreCategory).not.toHaveBeenCalled();
    expect(db.upsertStoreCategory).not.toHaveBeenCalled();
  });

  it("helpers", () => {
    expect(pathKey([" Home ", "Candles"])).toBe("home › candles");
    expect(crumbsFromText("Home & Kitchen›Furniture›Gaming Chairs")).toEqual(["Home & Kitchen", "Furniture", "Gaming Chairs"]);
  });
});
