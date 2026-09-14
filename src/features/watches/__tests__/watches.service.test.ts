import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/db/queries/price-watches", () => ({
  listActiveWatchesByUser: vi.fn(),
  listRetiredWatchesByUser: vi.fn(async () => []),
  getWatchById: vi.fn(),
  getWatchByUserAndHash: vi.fn(),
  insertPriceWatch: vi.fn(),
  reactivatePriceWatch: vi.fn(),
  deletePriceWatch: vi.fn(),
  listWatchesDueForCheck: vi.fn(),
  markWatchChecked: vi.fn(),
  markWatchFailed: vi.fn(),
  insertPriceObservation: vi.fn(),
  listObservationsForWatch: vi.fn(),
  listObservationsForWatches: vi.fn(),
}));

vi.mock("@/features/extraction/extraction.service", () => ({
  prepareProductUrl: vi.fn(),
  extractPrepared: vi.fn(),
}));

vi.mock("@/features/extraction/quote.service", () => ({
  priceExtraction: vi.fn(),
}));

vi.mock("@/features/audit/services/audit.service", () => ({
  logAuditEvent: vi.fn(),
}));

// The drop rule is exercised in price-drop.service.test.ts. Here it is stubbed
// so these tests stay about the BATCH — what is claimed, what is retried, what
// is retired — and cannot start failing because an alert's wording changed.
vi.mock("../services/price-drop.service", () => ({
  resolveDropThreshold: vi.fn(),
  tryNotifyPriceDrop: vi.fn(),
}));

vi.mock("@/db/queries/regions", () => ({ listRegions: vi.fn(), getRegionByCode: vi.fn() }));
vi.mock("@/db/queries/delivery-zones", () => ({ listActiveDeliveryZones: vi.fn() }));
vi.mock("@/db/queries/pricing-constants", () => ({ getPricingConstantsMap: vi.fn() }));
vi.mock("@/db/queries/pricing-groups", () => ({
  getAllPricingGroups: vi.fn(),
  getCategoryPricingMap: vi.fn(),
}));
vi.mock("@/lib/exchange-rates/service", () => ({
  RATE_CURRENCIES: ["USD", "GBP", "CNY"] as const,
  getRate: vi.fn(),
  getGhsRate: vi.fn(),
}));

import { logger } from "@/lib/logger";
import {
  deletePriceWatch,
  getWatchById,
  getWatchByUserAndHash,
  insertPriceObservation,
  insertPriceWatch,
  listActiveWatchesByUser,
  listRetiredWatchesByUser,
  listObservationsForWatch,
  listObservationsForWatches,
  listWatchesDueForCheck,
  markWatchChecked,
  markWatchFailed,
  reactivatePriceWatch,
  type PriceWatchRow,
} from "@/db/queries/price-watches";
import { extractPrepared, prepareProductUrl } from "@/features/extraction/extraction.service";
import { priceExtraction } from "@/features/extraction/quote.service";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { resolveDropThreshold, tryNotifyPriceDrop } from "../services/price-drop.service";
import { APIError } from "@/lib/auth/api-helpers";
import { PRICE_WATCH_JOB } from "@/config/security";
import {
  createWatch,
  deleteWatch,
  getWatchHistory,
  isWatching,
  listWatches,
  runPriceWatchJob,
} from "../services/watches.service";

const mockListActive = vi.mocked(listActiveWatchesByUser);
const mockListRetired = vi.mocked(listRetiredWatchesByUser);
const mockGetById = vi.mocked(getWatchById);
const mockGetByHash = vi.mocked(getWatchByUserAndHash);
const mockInsertWatch = vi.mocked(insertPriceWatch);
const mockReactivate = vi.mocked(reactivatePriceWatch);
const mockDelete = vi.mocked(deletePriceWatch);
const mockListDue = vi.mocked(listWatchesDueForCheck);
const mockMarkChecked = vi.mocked(markWatchChecked);
const mockMarkFailed = vi.mocked(markWatchFailed);
const mockInsertObservation = vi.mocked(insertPriceObservation);
const mockListObservations = vi.mocked(listObservationsForWatch);
const mockListObservationsMany = vi.mocked(listObservationsForWatches);
const mockPrepare = vi.mocked(prepareProductUrl);
const mockExtract = vi.mocked(extractPrepared);
const mockPrice = vi.mocked(priceExtraction);
const mockThreshold = vi.mocked(resolveDropThreshold);
const mockNotify = vi.mocked(tryNotifyPriceDrop);
const mockLogAudit = vi.mocked(logAuditEvent);

const USER = "11111111-1111-1111-1111-111111111111";
const OTHER_USER = "22222222-2222-2222-2222-222222222222";
const URL = "https://www.amazon.com/dp/B0CHX1W1XY";

function watchRow(overrides: Partial<PriceWatchRow> = {}): PriceWatchRow {
  return {
    id: "watch-1",
    user_id: USER,
    product_url: URL,
    url_hash: "hash-1",
    product_name: "Sony WH-1000XM5",
    product_image_url: "https://img.example/1.jpg",
    extraction_cache_id: "cache-1",
    baseline_price_usd: 349,
    baseline_total_ghs: 5041.16,
    last_price_usd: 349,
    last_total_ghs: 5041.16,
    last_checked_at: "2026-09-11T06:00:00.000Z",
    consecutive_failures: 0,
    last_error: null,
    notify_on_drop: true,
    notified_at: null,
    notified_price_usd: null,
    is_active: true,
    kind: "price",
    sourcing_status: null,
    sourcing_cart_item_id: null,
    sourced_price_usd: null,
    sourced_origin_country: null,
    sourced_note: null,
    customer_price_hint_usd: null,
    customer_origin_hint: null,
    reviewed_by: null,
    reviewed_at: null,
    created_at: "2026-09-01T06:00:00.000Z",
    updated_at: "2026-09-11T06:00:00.000Z",
    ...overrides,
  };
}

/** A successful canonicalise → extract → price round, with server-owned numbers. */
function arrangeResolution(priceUsd = 299, totalGhs = 4500, exchangeRate = 15.05) {
  mockPrepare.mockResolvedValue({
    canonicalUrl: URL,
    urlHash: "hash-1",
    platform: "amazon",
    region: "USA",
  } as Awaited<ReturnType<typeof prepareProductUrl>>);

  mockExtract.mockResolvedValue({
    product: { title: "Sony WH-1000XM5", image: "https://img.example/1.jpg" },
    extraction_cache_id: "cache-1",
  } as unknown as Awaited<ReturnType<typeof extractPrepared>>);

  mockPrice.mockResolvedValue({
    pricing: {
      item_price_usd: priceUsd,
      total_ghs: totalGhs,
      exchange_rate: exchangeRate,
    },
    reason: null,
  } as unknown as Awaited<ReturnType<typeof priceExtraction>>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListRetired.mockResolvedValue([]);
  mockListObservations.mockResolvedValue([]);
  mockListObservationsMany.mockResolvedValue([]);
  mockInsertObservation.mockResolvedValue({} as never);
  mockMarkChecked.mockResolvedValue(undefined);
  mockMarkFailed.mockResolvedValue(undefined);
  mockLogAudit.mockResolvedValue(undefined);
  mockThreshold.mockResolvedValue(0.03);
  mockNotify.mockResolvedValue({ notified: false, reason: "no_drop" });
});

describe("listWatches", () => {
  it("returns an empty list without touching the observations table", async () => {
    mockListActive.mockResolvedValue([]);

    const result = await listWatches(USER);

    expect(result).toEqual({ watches: [], watching_count: 0, retired: [] });
    expect(mockListObservationsMany).not.toHaveBeenCalled();
  });

  it("reports watches the job gave up on instead of dropping them", async () => {
    // `is_active` means both "the customer paused this" and "the job retired
    // it". Filtering the second out of every query made a watch vanish with no
    // notice, leaving its owner believing a price was still being tracked.
    mockListActive.mockResolvedValue([]);
    mockListRetired.mockResolvedValue([
      {
        ...watchRow({ id: "dead-1" }),
        is_active: false,
        consecutive_failures: 5,
        last_error: "Product page returned 404",
      },
    ] as never);

    const result = await listWatches(USER);

    expect(result.watches).toEqual([]);
    expect(result.watching_count).toBe(0);
    expect(result.retired).toHaveLength(1);
    expect(result.retired[0]?.last_error).toBe("Product page returned 404");
    expect(result.retired[0]?.watch.id).toBe("dead-1");
  });

  it("loads every series in one query, not one per watch", async () => {
    mockListActive.mockResolvedValue([watchRow(), watchRow({ id: "watch-2" })]);

    await listWatches(USER);

    expect(mockListObservationsMany).toHaveBeenCalledTimes(1);
    expect(mockListObservationsMany.mock.calls[0]?.[0]).toEqual(["watch-1", "watch-2"]);
  });

  it("attaches each watch's own stats and counts what is being watched", async () => {
    mockListActive.mockResolvedValue([watchRow(), watchRow({ id: "watch-2" })]);
    mockListObservationsMany.mockResolvedValue([
      {
        id: "o1",
        watch_id: "watch-1",
        price_usd: 400,
        total_ghs: 6000,
        exchange_rate: 15,
        observed_at: daysAgo(9),
      },
      {
        id: "o2",
        watch_id: "watch-1",
        price_usd: 250,
        total_ghs: 3750,
        exchange_rate: 15,
        observed_at: daysAgo(1),
      },
    ]);

    const result = await listWatches(USER);

    expect(result.watching_count).toBe(2);
    expect(result.watches[0]?.stats.has_trend).toBe(true);
    expect(result.watches[0]?.stats.delta_usd).toBe(-150);
    // The second watch has no series at all — it must say so, not borrow one.
    expect(result.watches[1]?.stats.has_trend).toBe(false);
    expect(result.watches[1]?.stats.status_label).toBe("not checked yet");
  });

  it("does not leak internal columns to the client", async () => {
    mockListActive.mockResolvedValue([watchRow({ last_error: "403 from store" })]);

    const item = (await listWatches(USER)).watches[0];

    expect(item).toBeDefined();
    expect(item?.watch).not.toHaveProperty("user_id");
    expect(item?.watch).not.toHaveProperty("url_hash");
    expect(item?.watch).not.toHaveProperty("last_error");
    expect(item?.watch).not.toHaveProperty("consecutive_failures");
  });
});

describe("createWatch", () => {
  it("stores the SERVER's price, never anything the caller could choose", async () => {
    arrangeResolution(299, 4500, 15.05);
    mockGetByHash.mockResolvedValue(null);
    mockInsertWatch.mockResolvedValue(watchRow({ baseline_price_usd: 299 }));

    await createWatch(USER, URL);

    expect(mockInsertWatch).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER,
        url_hash: "hash-1",
        product_url: URL,
        baseline_price_usd: 299,
        baseline_total_ghs: 4500,
        last_price_usd: 299,
        last_total_ghs: 4500,
      }),
    );
  });

  it("canonicalises the link through the extraction hasher so a watch and a quote share a cache key", async () => {
    arrangeResolution();
    mockGetByHash.mockResolvedValue(null);
    mockInsertWatch.mockResolvedValue(watchRow());

    await createWatch(USER, "  https://www.amazon.com/dp/B0CHX1W1XY?ref=foo  ");

    expect(mockPrepare).toHaveBeenCalledWith("  https://www.amazon.com/dp/B0CHX1W1XY?ref=foo  ");
    expect(mockGetByHash).toHaveBeenCalledWith(USER, "hash-1");
  });

  it("appends the first observation immediately, with the rate that produced the total", async () => {
    arrangeResolution(299, 4500, 15.05);
    mockGetByHash.mockResolvedValue(null);
    mockInsertWatch.mockResolvedValue(watchRow());

    const result = await createWatch(USER, URL);

    expect(mockInsertObservation).toHaveBeenCalledWith({
      watch_id: "watch-1",
      price_usd: 299,
      total_ghs: 4500,
      exchange_rate: 15.05,
    });
    expect(result.created).toBe(true);
  });

  it("is idempotent: re-pasting a watched link records a reading but keeps the baseline", async () => {
    arrangeResolution(280, 4200, 15);
    mockGetByHash.mockResolvedValue(watchRow());
    mockGetById.mockResolvedValue(watchRow({ last_price_usd: 280 }));

    const result = await createWatch(USER, URL);

    expect(result.created).toBe(false);
    expect(mockInsertWatch).not.toHaveBeenCalled();
    expect(mockReactivate).not.toHaveBeenCalled();
    expect(mockInsertObservation).toHaveBeenCalledTimes(1);
    expect(mockMarkChecked).toHaveBeenCalledWith(
      "watch-1",
      expect.objectContaining({ last_price_usd: 280, last_total_ghs: 4200 }),
    );
  });

  it("re-arms a removed or retired watch instead of violating the unique pair", async () => {
    arrangeResolution(310, 4650, 15);
    mockGetByHash.mockResolvedValue(watchRow({ is_active: false, consecutive_failures: 5 }));
    mockReactivate.mockResolvedValue(watchRow({ baseline_price_usd: 310 }));

    const result = await createWatch(USER, URL);

    expect(mockInsertWatch).not.toHaveBeenCalled();
    expect(mockReactivate).toHaveBeenCalledWith(
      "watch-1",
      expect.objectContaining({ baseline_price_usd: 310, last_price_usd: 310 }),
    );
    expect(result.created).toBe(true);
  });

  it("refuses to create a watch it cannot price, rather than storing a null baseline", async () => {
    arrangeResolution();
    mockPrice.mockResolvedValue({
      pricing: null,
      reason: "Price could not be read from the product page.",
    } as unknown as Awaited<ReturnType<typeof priceExtraction>>);
    mockGetByHash.mockResolvedValue(null);

    await expect(createWatch(USER, URL)).rejects.toMatchObject({
      statusCode: 422,
      message: "Price could not be read from the product page.",
    });
    expect(mockInsertWatch).not.toHaveBeenCalled();
  });

  it("audits the creation with the baseline it committed to", async () => {
    arrangeResolution(299, 4500, 15.05);
    mockGetByHash.mockResolvedValue(null);
    mockInsertWatch.mockResolvedValue(watchRow());

    await createWatch(USER, URL);

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: USER,
        action: "price_watch_created",
        entityType: "price_watch",
        entityId: "watch-1",
      }),
    );
  });
});

describe("deleteWatch", () => {
  it("deletes a watch the caller owns", async () => {
    mockGetById.mockResolvedValue(watchRow());
    mockDelete.mockResolvedValue(undefined);

    expect(await deleteWatch(USER, "watch-1")).toEqual({ id: "watch-1", deleted: true });
    expect(mockDelete).toHaveBeenCalledWith("watch-1");
  });

  it("answers 404, not 403, for someone else's watch so existence does not leak", async () => {
    mockGetById.mockResolvedValue(watchRow({ user_id: OTHER_USER }));

    await expect(deleteWatch(USER, "watch-1")).rejects.toMatchObject({
      statusCode: 404,
      message: "Watch not found",
    });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("answers 404 for an id that does not exist", async () => {
    mockGetById.mockResolvedValue(null);
    await expect(deleteWatch(USER, "watch-9")).rejects.toBeInstanceOf(APIError);
  });
});

describe("getWatchHistory", () => {
  it("clamps an absurd window instead of scanning a year of rows per bar", async () => {
    mockGetById.mockResolvedValue(watchRow());

    const result = await getWatchHistory(USER, "watch-1", 100_000);

    expect(result.days).toBe(365);
  });

  it("clamps a zero or negative window up to a day", async () => {
    mockGetById.mockResolvedValue(watchRow());
    expect((await getWatchHistory(USER, "watch-1", 0)).days).toBe(1);
    expect((await getWatchHistory(USER, "watch-1", -5)).days).toBe(1);
  });

  it("derives the stats from the same window it returns", async () => {
    mockGetById.mockResolvedValue(watchRow());
    mockListObservations.mockResolvedValue([
      { id: "o1", watch_id: "watch-1", price_usd: 400, total_ghs: 6000, exchange_rate: 15, observed_at: daysAgo(9) },
      { id: "o2", watch_id: "watch-1", price_usd: 312, total_ghs: 4680, exchange_rate: 15, observed_at: daysAgo(1) },
    ]);

    const result = await getWatchHistory(USER, "watch-1", 30);

    expect(result.observations).toHaveLength(2);
    expect(result.stats.delta_usd).toBe(-88);
    expect(result.stats.is_lowest_in_30d).toBe(true);
  });

  it("hides another customer's history behind a 404", async () => {
    mockGetById.mockResolvedValue(watchRow({ user_id: OTHER_USER }));
    await expect(getWatchHistory(USER, "watch-1", 30)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("converts PostgREST's NUMERIC strings back to numbers", async () => {
    mockGetById.mockResolvedValue(watchRow());
    mockListObservations.mockResolvedValue([
      {
        id: "o1",
        watch_id: "watch-1",
        price_usd: "349.00" as unknown as number,
        total_ghs: "5041.16" as unknown as number,
        exchange_rate: "14.4300" as unknown as number,
        observed_at: daysAgo(1),
      },
    ]);

    const result = await getWatchHistory(USER, "watch-1", 30);

    expect(result.observations[0]).toEqual({
      price_usd: 349,
      total_ghs: 5041.16,
      exchange_rate: 14.43,
      observed_at: expect.any(String),
    });
  });
});

describe("runPriceWatchJob", () => {
  it("does nothing, cheaply, when nothing is due", async () => {
    mockListDue.mockResolvedValue([]);

    expect(await runPriceWatchJob()).toEqual({
      checked: 0,
      updated: 0,
      failed: 0,
      deactivated: 0,
      notified: 0,
      more_due: false,
    });
    expect(mockPrepare).not.toHaveBeenCalled();
    // Nothing due is the common case ten minutes out of ten; it must not cost
    // a constants read or an audit row.
    expect(mockThreshold).not.toHaveBeenCalled();
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it("claims one batch, and only watches whose last check is outside the due window", async () => {
    mockListDue.mockResolvedValue([]);
    await runPriceWatchJob(new Date("2026-09-13T12:00:00.000Z"));

    // 20 hours before noon on the 13th.
    expect(mockListDue).toHaveBeenCalledWith(
      PRICE_WATCH_JOB.batchSize,
      "2026-09-12T16:00:00.000Z",
    );
  });

  it("flags more_due when the batch came back full, so a backlog is visible", async () => {
    arrangeResolution();
    mockListDue.mockResolvedValue(
      Array.from({ length: PRICE_WATCH_JOB.batchSize }, (_, i) => watchRow({ id: `watch-${i}` })),
    );

    expect((await runPriceWatchJob()).more_due).toBe(true);
  });

  it("appends exactly one observation per watch and clears the failure counter", async () => {
    arrangeResolution(250, 3750, 15);
    mockListDue.mockResolvedValue([watchRow(), watchRow({ id: "watch-2" })]);

    const summary = await runPriceWatchJob();

    expect(summary).toEqual({
      checked: 2,
      updated: 2,
      failed: 0,
      deactivated: 0,
      notified: 0,
      more_due: false,
    });
    expect(mockInsertObservation).toHaveBeenCalledTimes(2);
    expect(mockMarkChecked).toHaveBeenCalledTimes(2);
    expect(mockMarkFailed).not.toHaveBeenCalled();
  });

  it("never runs more extractions at once than the concurrency allows", async () => {
    arrangeResolution();
    mockListDue.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => watchRow({ id: `watch-${i}` })),
    );

    let inFlight = 0;
    let peak = 0;
    mockExtract.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      return {
        product: { title: "t", image: null },
        extraction_cache_id: "cache-1",
      } as unknown as Awaited<ReturnType<typeof extractPrepared>>;
    });

    await runPriceWatchJob();

    expect(peak).toBeLessThanOrEqual(PRICE_WATCH_JOB.concurrency);
  });

  it("keeps the stored name and image when a re-check cannot read them", async () => {
    arrangeResolution();
    mockExtract.mockResolvedValue({
      product: { title: null, image: null },
      extraction_cache_id: "cache-1",
    } as unknown as Awaited<ReturnType<typeof extractPrepared>>);
    mockListDue.mockResolvedValue([watchRow()]);

    await runPriceWatchJob();

    expect(mockMarkChecked).toHaveBeenCalledWith(
      "watch-1",
      expect.objectContaining({
        product_name: "Sony WH-1000XM5",
        product_image_url: "https://img.example/1.jpg",
      }),
    );
  });

  it("counts a failed watch without failing the run, and stamps last_checked_at anyway", async () => {
    arrangeResolution();
    mockExtract.mockRejectedValue(new Error("404 from store"));
    mockListDue.mockResolvedValue([watchRow(), watchRow({ id: "watch-2" })]);

    const summary = await runPriceWatchJob();

    expect(summary).toEqual({
      checked: 2,
      updated: 0,
      failed: 2,
      deactivated: 0,
      notified: 0,
      more_due: false,
    });
    expect(mockMarkFailed).toHaveBeenCalledWith(
      "watch-1",
      expect.objectContaining({
        consecutive_failures: 1,
        last_error: "404 from store",
        is_active: true,
        checked_at: expect.any(String),
      }),
    );
  });

  it("one bad link does not stop the good ones", async () => {
    arrangeResolution();
    mockExtract
      .mockRejectedValueOnce(new Error("410 Gone"))
      .mockResolvedValue({
        product: { title: "t", image: null },
        extraction_cache_id: "cache-1",
      } as unknown as Awaited<ReturnType<typeof extractPrepared>>);
    mockListDue.mockResolvedValue([watchRow(), watchRow({ id: "watch-2" })]);

    expect(await runPriceWatchJob()).toEqual({
      checked: 2,
      updated: 1,
      failed: 1,
      deactivated: 0,
      notified: 0,
      more_due: false,
    });
  });

  it("retires a watch on the Nth consecutive failure so a dead URL stops costing scraper credit", async () => {
    arrangeResolution();
    mockExtract.mockRejectedValue(new Error("410 Gone"));
    mockListDue.mockResolvedValue([
      watchRow({ consecutive_failures: PRICE_WATCH_JOB.maxConsecutiveFailures - 1 }),
    ]);

    const summary = await runPriceWatchJob();

    expect(summary).toEqual({
      checked: 1,
      updated: 0,
      failed: 1,
      deactivated: 1,
      notified: 0,
      more_due: false,
    });
    expect(mockMarkFailed).toHaveBeenCalledWith(
      "watch-1",
      expect.objectContaining({
        consecutive_failures: PRICE_WATCH_JOB.maxConsecutiveFailures,
        is_active: false,
      }),
    );
  });

  it("keeps a watch alive one failure short of the ceiling", async () => {
    arrangeResolution();
    mockExtract.mockRejectedValue(new Error("timeout"));
    mockListDue.mockResolvedValue([
      watchRow({ consecutive_failures: PRICE_WATCH_JOB.maxConsecutiveFailures - 2 }),
    ]);

    const summary = await runPriceWatchJob();

    expect(summary.deactivated).toBe(0);
    expect(mockMarkFailed).toHaveBeenCalledWith(
      "watch-1",
      expect.objectContaining({ is_active: true }),
    );
  });

  it("fails the whole run loudly when a table is missing — that is a deploy bug, not a bad link", async () => {
    arrangeResolution();
    mockExtract.mockRejectedValue(
      new Error("Failed to load price observations: Could not find the table 'public.price_observations' in the schema cache"),
    );
    mockListDue.mockResolvedValue([watchRow()]);

    await expect(runPriceWatchJob()).rejects.toThrow(/could not find the table/i);
    expect(mockMarkFailed).not.toHaveBeenCalled();
  });

  it("audits the run summary", async () => {
    arrangeResolution();
    mockListDue.mockResolvedValue([watchRow()]);

    await runPriceWatchJob();

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorRole: "system",
        action: "price_watch_job_run",
        entityType: "job",
        metadata: {
          checked: 1,
          updated: 1,
          failed: 0,
          deactivated: 0,
          notified: 0,
          more_due: false,
        },
      }),
    );
  });

  it("reads the drop threshold once per batch, not once per watch", async () => {
    // Two watches in one batch must be judged by the same number. Re-reading
    // it mid-run would let an admin edit land between them.
    arrangeResolution();
    mockListDue.mockResolvedValue([watchRow(), watchRow({ id: "watch-2" })]);

    await runPriceWatchJob();

    expect(mockThreshold).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledTimes(2);
    expect(mockNotify).toHaveBeenCalledWith(expect.anything(), expect.anything(), 0.03);
  });

  it("offers the alert the PRE-CHECK row and the fresh reading", async () => {
    // The rule compares against `notified_price_usd` as it stood before this
    // check. Handing it the post-check row would compare the price to itself.
    arrangeResolution(250, 3750, 15);
    mockListDue.mockResolvedValue([watchRow({ notified_price_usd: 349 })]);

    await runPriceWatchJob();

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ id: "watch-1", notified_price_usd: 349 }),
      { priceUsd: 250, totalGhs: 3750, exchangeRate: 15 },
      0.03,
    );
  });

  it("counts the alerts it decided", async () => {
    arrangeResolution();
    mockListDue.mockResolvedValue([watchRow(), watchRow({ id: "watch-2" })]);
    mockNotify
      .mockResolvedValueOnce({ notified: true, reason: "drop", delivered: true })
      .mockResolvedValueOnce({ notified: false, reason: "below_threshold" });

    expect((await runPriceWatchJob()).notified).toBe(1);
  });

  it("a broken alert does not fail the check that found it", async () => {
    // tryNotifyPriceDrop absorbs delivery problems; the watch was re-checked
    // successfully and must not collect a failure for a mail server's sake.
    arrangeResolution();
    mockListDue.mockResolvedValue([watchRow()]);
    mockNotify.mockResolvedValue({ notified: false, reason: "error" });

    const summary = await runPriceWatchJob();

    expect(summary).toMatchObject({ updated: 1, failed: 0, notified: 0 });
    expect(mockMarkFailed).not.toHaveBeenCalled();
  });
});

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("isWatching", () => {
  it("is true only for a signed-in customer's active watch on that product", async () => {
    mockGetByHash.mockResolvedValue(watchRow({ is_active: true }));
    expect(await isWatching("user-1", "hash-1")).toBe(true);
    expect(mockGetByHash).toHaveBeenCalledWith("user-1", "hash-1");
  });

  it("is false for a paused watch, no watch, or a visitor", async () => {
    mockGetByHash.mockResolvedValue(watchRow({ is_active: false }));
    expect(await isWatching("user-1", "hash-1")).toBe(false);

    mockGetByHash.mockResolvedValue(null);
    expect(await isWatching("user-1", "hash-1")).toBe(false);

    mockGetByHash.mockClear();
    expect(await isWatching(null, "hash-1")).toBe(false);
    expect(mockGetByHash).not.toHaveBeenCalled();
  });

  it("degrades a flaky read to false with a warning — it decorates a quote and must not 500 it", async () => {
    mockGetByHash.mockRejectedValue(new Error("Failed to load watch: timeout"));
    expect(await isWatching("user-1", "hash-1")).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("still surfaces a missing price_watches table", async () => {
    mockGetByHash.mockRejectedValue(new Error("Could not find the table 'public.price_watches' in the schema cache"));
    await expect(isWatching("user-1", "hash-1")).rejects.toThrow(/price_watches/);
  });
});
