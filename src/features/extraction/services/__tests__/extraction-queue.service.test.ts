import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

vi.mock("@/db/queries/extraction-requests", () => ({
  claimExtractionRequest: vi.fn(),
  completeExtractionRequest: vi.fn(),
  enqueueExtractionRequest: vi.fn(),
  findExtractionRequestByUrl: vi.fn(),
  listQueuedExtractionRequests: vi.fn(),
  reclaimStaleExtractionRequests: vi.fn(),
  requeueExtractionRequest: vi.fn(),
}));
vi.mock("@/db/queries/extraction-cache", () => ({ getCachedExtractionByHash: vi.fn() }));
vi.mock("../paste-notify.service", () => ({ notifyPasteFinished: vi.fn(async () => "too_quick") }));
vi.mock("../../extraction.service", () => ({
  extractPrepared: vi.fn(),
  prepareProductUrl: vi.fn(async (url: string) => ({ canonicalUrl: url, urlHash: `hash:${url}` })),
}));

import {
  claimExtractionRequest,
  completeExtractionRequest,
  enqueueExtractionRequest,
  listQueuedExtractionRequests,
  reclaimStaleExtractionRequests,
  requeueExtractionRequest,
} from "@/db/queries/extraction-requests";
import { getCachedExtractionByHash } from "@/db/queries/extraction-cache";
import { extractPrepared } from "../../extraction.service";
import {
  MAX_EXTRACTION_ATTEMPTS,
  enqueuePaste,
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
