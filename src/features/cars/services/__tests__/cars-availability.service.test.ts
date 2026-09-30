import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { hasPublishedCarListing, revalidateTag, cacheOptions } = vi.hoisted(() => ({
  hasPublishedCarListing: vi.fn(),
  revalidateTag: vi.fn(),
  cacheOptions: [] as unknown[],
}));

vi.mock("@/db/queries/cars", () => ({ hasPublishedCarListing }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("next/cache", () => ({
  // Pass-through: the test is about what the service decides, not Next's cache.
  unstable_cache: (fn: () => unknown, _keys: string[], options: unknown) => {
    cacheOptions.push(options);
    return fn;
  },
  revalidateTag,
}));

import {
  PUBLISHED_CARS_TAG,
  hasPublishedCars,
  invalidatePublishedCars,
} from "../cars-availability.service";

beforeEach(() => {
  hasPublishedCarListing.mockReset();
  revalidateTag.mockReset();
});

describe("hasPublishedCars", () => {
  it("is cached under the tag the writes invalidate, with a TTL backstop", () => {
    expect(cacheOptions).toEqual([{ tags: [PUBLISHED_CARS_TAG], revalidate: 300 }]);
  });

  it("follows the query", async () => {
    hasPublishedCarListing.mockResolvedValueOnce(true);
    await expect(hasPublishedCars()).resolves.toBe(true);

    hasPublishedCarListing.mockResolvedValueOnce(false);
    await expect(hasPublishedCars()).resolves.toBe(false);
  });

  it("hides the tab when the read fails instead of failing the page", async () => {
    hasPublishedCarListing.mockRejectedValueOnce(new Error("db down"));
    await expect(hasPublishedCars()).resolves.toBe(false);
  });
});

describe("invalidatePublishedCars", () => {
  it("expires the tag immediately, not stale-while-revalidate", () => {
    invalidatePublishedCars();
    expect(revalidateTag).toHaveBeenCalledWith(PUBLISHED_CARS_TAG, { expire: 0 });
  });

  it("never turns a saved write into an error", () => {
    revalidateTag.mockImplementationOnce(() => {
      throw new Error("outside a request");
    });
    expect(() => invalidatePublishedCars()).not.toThrow();
  });
});
