import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { unstable_cache, revalidateTag } = vi.hoisted(() => ({ unstable_cache: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache, revalidateTag }));

import { logger } from "@/lib/logger";
import { CACHE_TAGS, expireCacheTag, sharedCache } from "../shared-cache";

const runtime = process.env.NEXT_RUNTIME;

beforeEach(() => {
  unstable_cache.mockReset();
  revalidateTag.mockReset();
  process.env.NEXT_RUNTIME = "nodejs";
});

afterEach(() => {
  if (runtime === undefined) delete process.env.NEXT_RUNTIME;
  else process.env.NEXT_RUNTIME = runtime;
});

describe("sharedCache", () => {
  it("reads through the data cache with the tag and TTL it was given", async () => {
    const cached = vi.fn(async (n: number) => n * 2);
    unstable_cache.mockReturnValue(cached);
    const read = sharedCache(async (n: number) => n, ["k"], { tags: [CACHE_TAGS.catalog], revalidateSeconds: 300 });

    expect(await read(21)).toBe(42);
    expect(unstable_cache).toHaveBeenCalledWith(expect.any(Function), ["k"], { tags: ["catalog"], revalidate: 300 });
  });

  it("runs the read uncached outside the Next server (tests, scripts)", async () => {
    delete process.env.NEXT_RUNTIME;
    const cached = vi.fn();
    unstable_cache.mockReturnValue(cached);
    const read = sharedCache(async (n: number) => n + 1, ["k"], { tags: [CACHE_TAGS.catalog], revalidateSeconds: 1 });
    expect(await read(1)).toBe(2);
    expect(cached).not.toHaveBeenCalled();
  });

  it("lets the read's own errors through", async () => {
    unstable_cache.mockReturnValue(async () => {
      throw new TypeError("Gateway Timeout");
    });
    const read = sharedCache(async () => 1, ["k"], { tags: [CACHE_TAGS.catalog], revalidateSeconds: 1 });
    await expect(read()).rejects.toThrow("Gateway Timeout");
  });
});

describe("expireCacheTag", () => {
  it("expires the tag immediately, not stale-while-revalidate", () => {
    expireCacheTag(CACHE_TAGS.banners);
    expect(revalidateTag).toHaveBeenCalledWith("banners", { expire: 0 });
  });

  it("swallows a failed expiry: the write it follows has already happened", () => {
    revalidateTag.mockImplementation(() => {
      throw new Error("no store");
    });
    expect(() => expireCacheTag(CACHE_TAGS.banners)).not.toThrow();
    expect(logger.warn).toHaveBeenCalled();
  });
});
