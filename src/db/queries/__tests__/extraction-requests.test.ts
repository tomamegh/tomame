import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const upsert = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: () => ({ upsert }) })),
}));

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import {
  getLatestExtractionRequest,
  recordExtractionRequest,
} from "../extraction-requests";

beforeEach(() => {
  vi.clearAllMocks();
  upsert.mockResolvedValue({ error: null });
});

describe("recordExtractionRequest", () => {
  const input = {
    userId: "user-1",
    urlHash: "hash-1",
    productUrl: "https://www.amazon.com/dp/B0TEST",
    extractionCacheId: "cache-1",
  };

  it("upserts on (user_id, url_hash) so a repeat paste bumps instead of duplicating", async () => {
    await recordExtractionRequest(input);

    const [row, options] = upsert.mock.calls[0] ?? [];
    expect(row).toMatchObject({
      user_id: "user-1",
      url_hash: "hash-1",
      product_url: "https://www.amazon.com/dp/B0TEST",
      extraction_cache_id: "cache-1",
    });
    expect(options).toEqual({ onConflict: "user_id,url_hash" });
  });

  it("bumps updated_at so the newest paste sorts first", async () => {
    await recordExtractionRequest(input);
    const [row] = upsert.mock.calls[0] ?? [];
    expect(typeof (row as { updated_at: string }).updated_at).toBe("string");
  });

  it("stores a null cache id when the extraction has no row", async () => {
    await recordExtractionRequest({ ...input, extractionCacheId: null });
    const [row] = upsert.mock.calls[0] ?? [];
    expect((row as { extraction_cache_id: string | null }).extraction_cache_id).toBeNull();
  });

  it("never throws on a database error — bookkeeping must not cost a quote", async () => {
    upsert.mockResolvedValue({ error: { code: "23503", message: "fk violation" } });
    await expect(recordExtractionRequest(input)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("never throws when the client itself blows up", async () => {
    upsert.mockRejectedValue(new Error("network down"));
    await expect(recordExtractionRequest(input)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe("getLatestExtractionRequest", () => {
  function clientReturning(result: { data: unknown; error: unknown }) {
    const calls: Record<string, unknown[]> = {};
    const chain = {
      select: (...args: unknown[]) => ((calls.select = args), chain),
      eq: (...args: unknown[]) => ((calls.eq = args), chain),
      order: (...args: unknown[]) => ((calls.order = args), chain),
      limit: (...args: unknown[]) => ((calls.limit = args), chain),
      maybeSingle: async () => result,
    };
    const client = { from: (...args: unknown[]) => ((calls.from = args), chain) };
    return { client: client as unknown as SupabaseClient, calls };
  }

  it("reads the newest paste for one customer", async () => {
    const row = {
      id: "req-1",
      url_hash: "hash-1",
      product_url: "https://example.com/p",
      extraction_cache_id: null,
      created_at: "2026-09-12T09:00:00.000Z",
      updated_at: "2026-09-12T09:30:00.000Z",
    };
    const { client, calls } = clientReturning({ data: row, error: null });

    expect(await getLatestExtractionRequest(client, "user-1")).toEqual(row);
    expect(calls.from).toEqual(["extraction_requests"]);
    expect(calls.eq).toEqual(["user_id", "user-1"]);
    expect(calls.order).toEqual(["updated_at", { ascending: false }]);
    expect(calls.limit).toEqual([1]);
  });

  it("returns null when the customer has pasted nothing", async () => {
    const { client } = clientReturning({ data: null, error: null });
    expect(await getLatestExtractionRequest(client, "user-1")).toBeNull();
  });

  it("throws a message-carrying error so the service can classify it", async () => {
    const { client } = clientReturning({
      data: null,
      error: {
        code: "42P01",
        message: 'relation "extraction_requests" does not exist',
      },
    });

    await expect(getLatestExtractionRequest(client, "user-1")).rejects.toThrow(
      /relation "extraction_requests" does not exist/,
    );
  });
});
