import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { extraction: { anthropicApiKey: "test-key" } } }));

const parse = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { parse };
  },
}));
vi.mock("@anthropic-ai/sdk/helpers/zod", () => ({ zodOutputFormat: () => ({ type: "json_schema" }) }));

import { FINDER } from "@/config/finder";

import { shortlistListings, understandRequest } from "../services/finder-ai.service";
import type { FinderListing } from "../shortlist";

const reply = (parsed_output: unknown, stop_reason = "end_turn") => ({ parsed_output, stop_reason, usage: { input_tokens: 120, output_tokens: 40 } });

beforeEach(() => parse.mockReset());

describe("understandRequest (Anthropic mocked at the SDK)", () => {
  it("asks the finder model and returns the validated spec, counting tokens", async () => {
    parse.mockResolvedValue(
      reply({ is_product_request: true, product: "PS5 Slim", search_query: "PS5 Slim Digital", must_haves: [], budget_ghs: null, category: null }),
    );
    const usage = { input: 0, output: 0 };
    const spec = await understandRequest("ps5 slim digital", null, usage);
    expect(spec).toMatchObject({ product: "PS5 Slim", searchQuery: "PS5 Slim Digital", newOnly: true });
    expect(parse.mock.calls[0]![0].model).toBe(FINDER.model);
    expect(usage).toEqual({ input: 120, output: 40 });
  });

  it("turns bad output, a refusal or an API error into null (a graceful no-match)", async () => {
    parse.mockResolvedValueOnce(reply({ product: 42 }));
    expect(await understandRequest("ps5", null)).toBeNull();
    parse.mockResolvedValueOnce(reply(null, "refusal"));
    expect(await understandRequest("ps5", null)).toBeNull();
    parse.mockRejectedValueOnce(new Error("overloaded"));
    expect(await understandRequest("ps5", null)).toBeNull();
  });
});

describe("shortlistListings", () => {
  const listing = (id: string, title: string): FinderListing => ({
    id,
    store: "amazon",
    title,
    productUrl: `https://www.amazon.com/dp/${id}`,
    imageUrl: null,
    priceUsd: 449.99,
    currency: "USD",
    condition: null,
    seller: null,
    source: "live",
  });
  const spec = { product: "PS5 Slim Digital", searchQuery: "PS5 Slim Digital", mustHaves: [], budgetGhs: null, newOnly: true, category: null };

  it("never shows the model a price, and maps its ids back to listings", async () => {
    parse.mockResolvedValue(reply({ matches: ["b"], rejected: [{ id: "a", reason: "accessory" }] }));
    const out = await shortlistListings(spec, [listing("a", "Skin for PS5 Slim"), listing("b", "PS5 Slim Digital Console")]);
    expect(out?.matches.map((l) => l.id)).toEqual(["b"]);
    const prompt = JSON.stringify(parse.mock.calls[0]![0].messages);
    expect(prompt).not.toContain("449");
    expect(prompt).not.toContain("$");
  });

  it("returns null when the model's answer does not fit", async () => {
    parse.mockResolvedValue(reply({ matches: [1, 2] }));
    expect(await shortlistListings(spec, [listing("a", "PS5")])).toBeNull();
  });
});
