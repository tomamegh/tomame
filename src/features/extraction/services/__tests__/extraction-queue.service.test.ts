import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

vi.mock("@/db/queries/extraction-requests", () => ({
  claimExtractionRequest: vi.fn(),
  completeExtractionRequest: vi.fn(),
  enqueueExtractionRequest: vi.fn(),
  findExtractionRequestByUrl: vi.fn(),
  giveUpStuckExtractionRequests: vi.fn(async () => 0),
  hasOpenRecheck: vi.fn(async () => false),
  listQueuedExtractionRequests: vi.fn(),
  reclaimStaleExtractionRequests: vi.fn(),
  requeueExtractionRequest: vi.fn(),
}));
vi.mock("@/db/queries/extraction-cache", () => ({ getCachedExtractionByHash: vi.fn() }));
vi.mock("../paste-notify.service", () => ({ notifyPasteFinished: vi.fn(async () => "too_quick") }));
// The catalogue enqueue (055/057) runs beside the notification after the job has
// settled. Mocked for the same reason the notifier is: it reaches a service-role
// client at module scope, so an unmocked import constructs one with no env and
// the whole FILE fails to load rather than any test failing.
vi.mock("@/features/catalog/services/catalog-enqueue.service", () => ({
  enqueueCatalogQueryFromPaste: vi.fn(async () => "enqueued"),
}));
vi.mock("../../extraction.service", () => ({
  extractPrepared: vi.fn(),
  prepareProductUrl: vi.fn(async (url: string) => ({ canonicalUrl: url, urlHash: `hash:${url}` })),
}));

import {
  claimExtractionRequest,
  completeExtractionRequest,
  enqueueExtractionRequest,
  giveUpStuckExtractionRequests,
  listQueuedExtractionRequests,
  reclaimStaleExtractionRequests,
  requeueExtractionRequest,
} from "@/db/queries/extraction-requests";
import { getCachedExtractionByHash } from "@/db/queries/extraction-cache";
import { notifyPasteFinished } from "../paste-notify.service";
import { extractPrepared } from "../../extraction.service";
import { enqueueCatalogQueryFromPaste } from "@/features/catalog/services/catalog-enqueue.service";
import {
  MAX_EXTRACTION_ATTEMPTS,
  enqueuePaste,
  PasteNotAdmittedError,
  PASTE_GIVE_UP_MS,
  isStaleRead,
  runExtractionJob,
  sweepExtractions,
} from "../extraction-queue.service";

const VIEWER = { userId: "u1", sessionId: null };

function job(over: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    url_hash: "h",
    product_url: "https://store.test/p/1",
    extraction_cache_id: null,
    created_at: "2026-09-13T09:00:00Z",
    updated_at: "2026-09-13T09:00:00Z",
    user_id: "u1",
    session_id: null,
    status: "pending",
    attempts: 0,
    started_at: null,
    finished_at: null,
    error: null,
    ...over,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCachedExtractionByHash).mockResolvedValue(null as never);
  vi.mocked(reclaimStaleExtractionRequests).mockResolvedValue(0);
  vi.mocked(listQueuedExtractionRequests).mockResolvedValue([]);
  vi.mocked(giveUpStuckExtractionRequests).mockResolvedValue(0);
});

describe("enqueuePaste", () => {
  it("answers a cached product without scheduling anything", async () => {
    vi.mocked(getCachedExtractionByHash).mockResolvedValue({ id: "cache-9" } as never);
    vi.mocked(enqueueExtractionRequest).mockResolvedValue(
      job({ status: "ready", extraction_cache_id: "cache-9" }),
    );

    const result = await enqueuePaste(VIEWER, "https://store.test/p/1");

    expect(result?.ready).toBe(true);
    // The cache id must reach the row, or the queue would re-read a product it
    // already has — the shared, product-keyed cache is the whole saving.
    expect(enqueueExtractionRequest).toHaveBeenCalledWith(
      expect.objectContaining({ cachedId: "cache-9" }),
    );
  });

  it("queues a link nobody has extracted yet", async () => {
    vi.mocked(enqueueExtractionRequest).mockResolvedValue(job());

    const result = await enqueuePaste(VIEWER, "https://store.test/p/1");

    expect(result?.ready).toBe(false);
    expect(enqueueExtractionRequest).toHaveBeenCalledWith(expect.objectContaining({ cachedId: null }));
  });

  it("is not ready when the row says ready but carries no extraction", async () => {
    // A pruned cache row nulls extraction_cache_id (FK is ON DELETE SET NULL).
    // Trusting the status alone would send the screen to a quote that is gone.
    vi.mocked(enqueueExtractionRequest).mockResolvedValue(
      job({ status: "ready", extraction_cache_id: null }),
    );

    expect((await enqueuePaste(VIEWER, "https://store.test/p/1"))?.ready).toBe(false);
  });

  it("tells the admit gate whether the paste is a cache hit, and writes nothing when refused", async () => {
    vi.mocked(getCachedExtractionByHash).mockResolvedValue({ id: "cache-9" } as never);
    const admit = vi.fn().mockResolvedValue(false);

    await expect(enqueuePaste(VIEWER, "https://store.test/p/1", admit)).rejects.toBeInstanceOf(PasteNotAdmittedError);
    expect(admit).toHaveBeenCalledWith(true);
    expect(enqueueExtractionRequest).not.toHaveBeenCalled();

    vi.mocked(getCachedExtractionByHash).mockResolvedValue(null);
    vi.mocked(enqueueExtractionRequest).mockResolvedValue(job());
    admit.mockResolvedValue(true);
    expect((await enqueuePaste(VIEWER, "https://store.test/p/1", admit))?.ready).toBe(false);
    expect(admit).toHaveBeenLastCalledWith(false);
  });
});

describe("runExtractionJob", () => {
  it("does nothing when another worker already claimed the row", async () => {
    vi.mocked(claimExtractionRequest).mockResolvedValue(null);

    expect(await runExtractionJob("req-1")).toBe("skipped");
    expect(extractPrepared).not.toHaveBeenCalled();
  });

  it("records the extraction that landed", async () => {
    vi.mocked(claimExtractionRequest).mockResolvedValue(job({ status: "running" }));
    vi.mocked(extractPrepared).mockResolvedValue({ extraction_cache_id: "cache-1" } as never);

    expect(await runExtractionJob("req-1")).toBe("ran");
    expect(completeExtractionRequest).toHaveBeenCalledWith(
      expect.objectContaining({ id: "req-1", status: "ready", extractionCacheId: "cache-1", attempts: 1 }),
    );
  });

  it("teaches the catalogue what the customer pasted", async () => {
    // 055/057: a successful paste enqueues a search term for the hourly scraper,
    // so the next customer who wants something similar finds it already priced.
    vi.mocked(claimExtractionRequest).mockResolvedValue(job({ status: "running" }));
    vi.mocked(extractPrepared).mockResolvedValue({ extraction_cache_id: "cache-1" } as never);

    expect(await runExtractionJob("req-1")).toBe("ran");
    expect(enqueueCatalogQueryFromPaste).toHaveBeenCalledWith("cache-1");
  });

  it("does not enqueue a term for a paste that produced nothing", async () => {
    vi.mocked(claimExtractionRequest).mockResolvedValue(job({ status: "running" }));
    vi.mocked(extractPrepared).mockResolvedValue({ extraction_cache_id: null } as never);

    await runExtractionJob("req-1");
    expect(enqueueCatalogQueryFromPaste).not.toHaveBeenCalled();
  });

  it("still succeeds when the catalogue enqueue throws", async () => {
    // The paste is already priced and its row already written by this point. A
    // throw here once requeued a finished extraction and charged a vendor twice,
    // which is why the call sits outside the try/catch AND is wrapped again.
    vi.mocked(claimExtractionRequest).mockResolvedValue(job({ status: "running" }));
    vi.mocked(extractPrepared).mockResolvedValue({ extraction_cache_id: "cache-1" } as never);
    vi.mocked(enqueueCatalogQueryFromPaste).mockRejectedValueOnce(new Error("catalogue is down"));

    expect(await runExtractionJob("req-1")).toBe("ran");
    expect(completeExtractionRequest).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ready" }),
    );
  });

  it("fails a run that produced no extraction to price against", async () => {
    vi.mocked(claimExtractionRequest).mockResolvedValue(job({ status: "running" }));
    vi.mocked(extractPrepared).mockResolvedValue({ extraction_cache_id: null } as never);

    expect(await runExtractionJob("req-1")).toBe("failed");
    expect(completeExtractionRequest).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("re-queues a thrown attempt instead of finishing it", async () => {
    vi.mocked(claimExtractionRequest).mockResolvedValue(job({ status: "running", attempts: 0 }));
    vi.mocked(extractPrepared).mockRejectedValue(new Error("vendor exploded"));

    expect(await runExtractionJob("req-1")).toBe("failed");
    expect(requeueExtractionRequest).toHaveBeenCalledWith("req-1", 1);
    // Completing it would stamp finished_at on a job that has not finished.
    expect(completeExtractionRequest).not.toHaveBeenCalled();
  });

  it("gives up once the attempts are spent, with something the customer can read", async () => {
    vi.mocked(claimExtractionRequest).mockResolvedValue(
      job({ status: "running", attempts: MAX_EXTRACTION_ATTEMPTS - 1 }),
    );
    vi.mocked(extractPrepared).mockRejectedValue(new Error("Zyte 520 Website Ban"));

    await runExtractionJob("req-1");

    const call = vi.mocked(completeExtractionRequest).mock.calls[0]![0];
    expect(call.status).toBe("failed");
    expect(call.attempts).toBe(MAX_EXTRACTION_ATTEMPTS);
    expect(requeueExtractionRequest).not.toHaveBeenCalled();
    // The vendor's words must never reach the customer.
    expect(call.error).not.toContain("Zyte");
  });
});

describe("sweepExtractions", () => {
  it("releases dead jobs before taking new ones", async () => {
    vi.mocked(reclaimStaleExtractionRequests).mockResolvedValue(2);

    const summary = await sweepExtractions();

    expect(summary.reclaimed).toBe(2);
    expect(reclaimStaleExtractionRequests).toHaveBeenCalledBefore(
      vi.mocked(listQueuedExtractionRequests),
    );
  });

  it("runs the batch one at a time and counts the outcomes", async () => {
    vi.mocked(listQueuedExtractionRequests).mockResolvedValue([
      job({ id: "a" }),
      job({ id: "b" }),
    ]);
    vi.mocked(claimExtractionRequest).mockImplementation(async (id: string) => job({ id, status: "running" }));
    vi.mocked(extractPrepared)
      .mockResolvedValueOnce({ extraction_cache_id: "c1" } as never)
      .mockResolvedValueOnce({ extraction_cache_id: null } as never);

    expect(await sweepExtractions()).toMatchObject({ claimed: 2, ran: 1, failed: 1 });
  });

  it("does not count a job another worker was already running", async () => {
    vi.mocked(listQueuedExtractionRequests).mockResolvedValue([job({ id: "a" })]);
    vi.mocked(claimExtractionRequest).mockResolvedValue(null);

    expect(await sweepExtractions()).toMatchObject({ claimed: 0, ran: 0, failed: 0 });
  });
});

describe("a notification must not be able to undo the job", () => {
  it("keeps a successful extraction settled when notifying throws", async () => {
    // `notifyPasteFinished` rethrows isSchemaMissingError on purpose, so a
    // deploy ahead of its migrations is loud. That throw used to land in the
    // job's own catch, which logged "extraction job failed" about an extraction
    // that had just SUCCEEDED and then requeued the finished row — a second
    // paid vendor call, and after three rounds a "could not read that page"
    // about a page that read perfectly.
    vi.mocked(claimExtractionRequest).mockResolvedValue(job());
    vi.mocked(extractPrepared).mockResolvedValue({ extraction_cache_id: "cache-1" } as never);
    vi.mocked(notifyPasteFinished).mockRejectedValueOnce(
      new Error('relation "public.notifications" does not exist'),
    );

    const result = await runExtractionJob("req-1");

    expect(result).toBe("ran");
    expect(completeExtractionRequest).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ready", extractionCacheId: "cache-1" }),
    );
    // The row stays finished. This is the assertion that matters.
    expect(requeueExtractionRequest).not.toHaveBeenCalled();
  });
});

// ── 106: stale re-reads, one retry, nothing reads forever ────────────────────

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const product = (over: Record<string, unknown> = {}) => ({ title: "LEGO", price: null, currency: null, availability: null, metadata: {}, ...over });

describe("re-paste of a stale read (106)", () => {
  it("knows a stale read from a fresh one", () => {
    expect(isStaleRead({ fetched_at: minutesAgo(60) })).toBe(true);
    expect(isStaleRead({ fetched_at: minutesAgo(5) })).toBe(false);
    expect(isStaleRead({ fetched_at: undefined as never })).toBe(false);
  });

  it("re-queues the same row with the old read kept, spending the read budget", async () => {
    vi.mocked(getCachedExtractionByHash).mockResolvedValue({ id: "cache-9", result: { fetched_at: minutesAgo(60) } } as never);
    vi.mocked(enqueueExtractionRequest).mockResolvedValue(job({ status: "pending", extraction_cache_id: "cache-9" }));
    const admit = vi.fn().mockResolvedValue(true);

    const result = await enqueuePaste(VIEWER, "https://store.test/p/1", admit);

    expect(admit).toHaveBeenCalledTimes(1);
    expect(admit).toHaveBeenCalledWith(false);
    expect(enqueueExtractionRequest).toHaveBeenCalledWith(expect.objectContaining({ cachedId: "cache-9", recheck: true }));
    expect(result).toMatchObject({ ready: false, rechecking: true });
  });

  it("a fresh read is not re-read: a cache hit, no vendor budget", async () => {
    vi.mocked(getCachedExtractionByHash).mockResolvedValue({ id: "cache-9", result: { fetched_at: minutesAgo(2) } } as never);
    vi.mocked(enqueueExtractionRequest).mockResolvedValue(job({ status: "ready", extraction_cache_id: "cache-9" }));
    const admit = vi.fn().mockResolvedValue(true);

    const result = await enqueuePaste(VIEWER, "https://store.test/p/1", admit);

    expect(admit).toHaveBeenCalledWith(true);
    expect(enqueueExtractionRequest).toHaveBeenCalledWith(expect.objectContaining({ recheck: false }));
    expect(result).toMatchObject({ ready: true, rechecking: false });
  });

  it("over the read budget, the stale read is served as the cache hit it is", async () => {
    vi.mocked(getCachedExtractionByHash).mockResolvedValue({ id: "cache-9", result: { fetched_at: minutesAgo(60) } } as never);
    vi.mocked(enqueueExtractionRequest).mockResolvedValue(job({ status: "ready", extraction_cache_id: "cache-9" }));
    const admit = vi.fn(async (cacheHit: boolean) => cacheHit);

    const result = await enqueuePaste(VIEWER, "https://store.test/p/1", admit);

    expect(admit.mock.calls).toEqual([[false], [true]]);
    expect(enqueueExtractionRequest).toHaveBeenCalledWith(expect.objectContaining({ recheck: false }));
    expect(result?.ready).toBe(true);
  });

  it("the re-check reads the store fresh, settles on the new read, and tells nobody", async () => {
    vi.mocked(claimExtractionRequest).mockResolvedValue(job({ status: "running", extraction_cache_id: "cache-9", attempts: 0 }));
    vi.mocked(extractPrepared).mockResolvedValue({ extraction_cache_id: "cache-9", product: product({ price: 12.99, currency: "USD" }) } as never);

    expect(await runExtractionJob("req-1")).toBe("ran");
    expect(vi.mocked(extractPrepared).mock.calls[0]?.[2]).toEqual({ fresh: true });
    expect(completeExtractionRequest).toHaveBeenCalledWith(expect.objectContaining({ status: "ready", extractionCacheId: "cache-9" }));
    expect(notifyPasteFinished).not.toHaveBeenCalled();
    expect(enqueueCatalogQueryFromPaste).not.toHaveBeenCalled();
  });

  it("a re-check that reads nothing is not retried: the old figures stand", async () => {
    vi.mocked(claimExtractionRequest).mockResolvedValue(job({ status: "running", extraction_cache_id: "cache-9" }));
    vi.mocked(extractPrepared).mockResolvedValue({ extraction_cache_id: "cache-9", product: product() } as never);

    expect(await runExtractionJob("req-1")).toBe("ran");
    expect(requeueExtractionRequest).not.toHaveBeenCalled();
  });
});

describe("a read where every tier failed is retried once (106)", () => {
  it("first attempt: back on the queue for ~45 s, nothing settled or announced", async () => {
    vi.mocked(claimExtractionRequest).mockResolvedValue(job({ status: "running", attempts: 0 }));
    vi.mocked(extractPrepared).mockResolvedValue({ extraction_cache_id: "cache-p", product: product({ title: null }) } as never);
    const before = Date.now();

    expect(await runExtractionJob("req-1")).toBe("retry");
    const [id, attempts, notBefore] = vi.mocked(requeueExtractionRequest).mock.calls[0]!;
    expect([id, attempts]).toEqual(["req-1", 1]);
    expect((notBefore as Date).getTime() - before).toBeGreaterThanOrEqual(44_000);
    expect(completeExtractionRequest).not.toHaveBeenCalled();
    expect(notifyPasteFinished).not.toHaveBeenCalled();
  });

  it("second attempt reads fresh (not the failed read cached for 5 min) and settles", async () => {
    vi.mocked(claimExtractionRequest).mockResolvedValue(job({ status: "running", attempts: 1 }));
    vi.mocked(extractPrepared).mockResolvedValue({ extraction_cache_id: "cache-p", product: product() } as never);

    expect(await runExtractionJob("req-1")).toBe("ran");
    expect(vi.mocked(extractPrepared).mock.calls[0]?.[2]).toEqual({ fresh: true });
    expect(requeueExtractionRequest).not.toHaveBeenCalled();
    expect(completeExtractionRequest).toHaveBeenCalledWith(expect.objectContaining({ status: "ready" }));
  });

  it("the store saying out of stock is an answer, not a failure: no retry", async () => {
    vi.mocked(claimExtractionRequest).mockResolvedValue(job({ status: "running", attempts: 0 }));
    vi.mocked(extractPrepared).mockResolvedValue({ extraction_cache_id: "cache-p", product: product({ availability: "Currently unavailable." }) } as never);

    expect(await runExtractionJob("req-1")).toBe("ran");
    expect(requeueExtractionRequest).not.toHaveBeenCalled();
  });
});

describe("nothing reads forever (106)", () => {
  it("the sweep ends pastes waiting past the give-up window", async () => {
    vi.mocked(giveUpStuckExtractionRequests).mockResolvedValue(2);
    const summary = await sweepExtractions();
    expect(giveUpStuckExtractionRequests).toHaveBeenCalledWith(PASTE_GIVE_UP_MS);
    expect(summary.gaveUp).toBe(2);
    expect(PASTE_GIVE_UP_MS).toBeGreaterThanOrEqual(4 * 60_000);
  });
});
