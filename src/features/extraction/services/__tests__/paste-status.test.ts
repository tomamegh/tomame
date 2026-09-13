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

describe("toPasteStatus", () => {
  it("keeps the owner columns and the attempt count out of the response", () => {
    const status = toPasteStatus(row());
    // Bookkeeping the browser has no business seeing.
    expect(status).not.toHaveProperty("user_id");
    expect(status).not.toHaveProperty("session_id");
    expect(status).not.toHaveProperty("attempts");
    expect(status).not.toHaveProperty("url_hash");
  });

  it("only hands over an extraction id once the job is actually ready", () => {
    // A row can carry a stale cache id while re-running; sending it would let a
    // screen navigate to a price that is being replaced.
    expect(toPasteStatus(row({ status: "running" })).extraction_cache_id).toBeNull();
    expect(toPasteStatus(row({ status: "pending" })).extraction_cache_id).toBeNull();
    expect(toPasteStatus(row()).extraction_cache_id).toBe("cache-1");
  });

  it("only surfaces an error once the job has given up on it", () => {
    // `error` is cleared on requeue, but a half-written row must not leak a
    // reason while the job is still trying.
    expect(toPasteStatus(row({ status: "running", error: "transient" })).error).toBeNull();
    expect(toPasteStatus(row({ status: "failed", error: "We could not read that page." })).error).toBe(
      "We could not read that page.",
    );
  });

  it("carries the queue time so a screen can strike its own wait from it", () => {
    expect(toPasteStatus(row()).created_at).toBe("2026-09-13T10:00:00Z");
  });
});
