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

const PRICED = { usable: true, priced: true, unavailable: false, title: "A thing" };
const UNPRICED = { usable: true, priced: false, unavailable: false, title: "A thing" };
const LAPSED = { usable: false, priced: false, unavailable: false, title: null };

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

  it("hands a failed paste to a buyer, never calls it lapsed, and carries its reason (110)", () => {
    const status = toPasteStatus(row({ status: "failed", error: "We could not read that page." }));
    expect(status.outcome).toBe("manual");
    expect(status.quote_expires_at).toBeNull();
    expect(status.error).toBe("We could not read that page.");
    expect(toPasteStatus(row({ status: "ready", outcome: "manual_quote" }), PRICED).outcome).toBe("manual");
  });

  it("runs a priced paste's free quote for 24 hours from when it was priced (110)", () => {
    const pricedAt = "2026-11-20T10:00:00Z";
    const live = toPasteStatus(row({ outcome: "priced", outcome_at: pricedAt }), PRICED, null, Date.parse("2026-11-21T09:00:00Z"));
    expect(live.outcome).toBe("priced");
    expect(live.quote_expires_at).toBe("2026-11-21T10:00:00.000Z");
    const lapsed = toPasteStatus(row({ outcome: "priced", outcome_at: pricedAt }), PRICED, null, Date.parse("2026-11-21T10:00:01Z"));
    expect(lapsed.outcome).toBe("expired");
    expect(lapsed.extraction_cache_id).toBeNull();
  });

  it("asks for a re-check, not a new quote, when the read lapses inside the 24 hours (110)", () => {
    const stale = toPasteStatus(row({ outcome: "priced", outcome_at: "2026-11-20T10:00:00Z" }), { ...PRICED, usable: false }, null, Date.parse("2026-11-20T23:00:00Z"));
    expect(stale.outcome).toBe("stale");
  });

  it("only surfaces an error once the job has given up on it", () => {
    expect(toPasteStatus(row({ status: "running", error: "transient" })).error).toBeNull();
  });

  it("carries the queue time so a screen can strike its own wait from it", () => {
    expect(toPasteStatus(row(), PRICED).created_at).toBe("2026-09-13T10:00:00Z");
  });

  it("says when a buyer already has the link, so the form is not offered twice", () => {
    expect(toPasteStatus(row(), UNPRICED).assisted).toBeNull();
    const status = toPasteStatus(row(), UNPRICED, {
      id: "ar-1",
      status: "contacted",
      created_at: "2026-09-13T10:05:00Z",
    });
    expect(status.assisted).toEqual({ status: "contacted", requested_at: "2026-09-13T10:05:00Z" });
    // The assisted row's id is staff bookkeeping; the browser does not need it.
    expect(status.assisted).not.toHaveProperty("id");
  });
});

describe("toPasteStatus — re-checks and stock (106)", () => {
  it("a re-check keeps the old figures on screen, marked, until it lands", () => {
    const status = toPasteStatus(row({ status: "running", extraction_cache_id: "cache-1" }), PRICED);
    expect(status.outcome).toBe("priced");
    expect(status.rechecking).toBe(true);
    expect(status.extraction_cache_id).toBe("cache-1");
    expect(toPasteStatus(row(), PRICED).rechecking).toBe(false);
  });

  it("a re-check whose old read has lapsed is plain reading", () => {
    const status = toPasteStatus(row({ status: "pending", extraction_cache_id: "cache-1" }), LAPSED);
    expect(status.outcome).toBe("reading");
    expect(status.rechecking).toBe(false);
  });

  it("an item the store says is out of stock is unavailable, not unpriced", () => {
    expect(toPasteStatus(row(), { ...UNPRICED, unavailable: true }).outcome).toBe("unavailable");
  });

  it("the reading clock runs from the latest ask, not from the first paste", () => {
    expect(toPasteStatus(row({ queued_at: "2026-09-14T08:00:00Z" }), PRICED).queued_at).toBe("2026-09-14T08:00:00Z");
    expect(toPasteStatus(row(), PRICED).queued_at).toBe("2026-09-13T10:00:00Z");
  });
});
