import { describe, it, expect } from "vitest";
import { toPasteStatus } from "../paste-status";

const row = (over: Record<string, unknown> = {}) =>
  ({
    id: "req-1",
    url_hash: "h",
    product_url: "https://store.test/p/1",
    extraction_cache_id: "cache-1",
    created_at: "2026-09-13T10:00:00Z",
    updated_at: "2026-09-13T10:00:05Z",
    user_id: "u1",
    session_id: null,
    status: "ready",
    attempts: 1,
    started_at: "2026-09-13T10:00:01Z",
    finished_at: "2026-09-13T10:00:05Z",
    error: null,
    ...over,
  }) as never;

const PRICED = { usable: true, priced: true };
const UNPRICED = { usable: true, priced: false };
const LAPSED = { usable: false, priced: false };

describe("toPasteStatus — what the screen may promise", () => {
  it("keeps bookkeeping out of the response", () => {
    const status = toPasteStatus(row(), PRICED);
    for (const key of ["user_id", "session_id", "attempts", "url_hash"]) {
      expect(status).not.toHaveProperty(key);
    }
  });

  it("calls a finished job PRICED only when the quote is live and has a price", () => {
    expect(toPasteStatus(row(), PRICED).outcome).toBe("priced");
    expect(toPasteStatus(row(), PRICED).extraction_cache_id).toBe("cache-1");
  });

  it("does not promise a price for a page that was read but never priced", () => {
    // The bug: `status: "ready"` meant "the job wrote a cache row", and the
    // screen read it as "Priced and ready". Links that had no price at all were
    // offering "See the landed price".
    const status = toPasteStatus(row(), UNPRICED);
    expect(status.outcome).toBe("unpriced");
    expect(status.extraction_cache_id).toBeNull();
  });

  it("does not link to a quote that has lapsed", () => {
    // Following one of these landed on "This quote is no longer available".
    const status = toPasteStatus(row(), LAPSED);
    expect(status.outcome).toBe("expired");
    expect(status.extraction_cache_id).toBeNull();
  });

  it("treats an unreadable extraction as expired rather than assuming the best", () => {
    // `getQuoteFacts` omits rows it could not read. A false "expired" costs one
    // re-paste; a false "priced" is a dead end.
    expect(toPasteStatus(row(), undefined).outcome).toBe("expired");
  });

  it("is still reading while the job is queued or running", () => {
    expect(toPasteStatus(row({ status: "pending", extraction_cache_id: null })).outcome).toBe("reading");
    expect(toPasteStatus(row({ status: "running", extraction_cache_id: null })).outcome).toBe("reading");
  });

  it("is expired when the job gave up, and carries its reason", () => {
    const status = toPasteStatus(row({ status: "failed", error: "We could not read that page." }));
    expect(status.outcome).toBe("expired");
    expect(status.error).toBe("We could not read that page.");
  });

  it("only surfaces an error once the job has given up on it", () => {
    expect(toPasteStatus(row({ status: "running", error: "transient" })).error).toBeNull();
  });

  it("carries the queue time so a screen can strike its own wait from it", () => {
    expect(toPasteStatus(row(), PRICED).created_at).toBe("2026-09-13T10:00:00Z");
  });
});
