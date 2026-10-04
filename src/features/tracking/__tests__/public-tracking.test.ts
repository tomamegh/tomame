import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock("@/db/queries/public-tracking", () => ({
  getOrderOwnerEmail: vi.fn(async () => "kwame@tomame.local"),
  getOrderPhones: vi.fn(async () => ["024 555 0192"]),
  getTrackingOrderByNo: vi.fn(async () => null),
  listTrackingEvents: vi.fn(async () => []),
  peekRateLimitCount: vi.fn(async () => ({ count: 0, resetAt: Date.now() + 60 * 60 * 1000 })),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import * as q from "@/db/queries/public-tracking";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

import {
  TRACKING_NOT_FOUND,
  classifyTrackingQuery,
  looksLikeTomameNumber,
  parseVerifier,
  verifierMatches,
} from "../public-tracking";
import { lookupPublicTracking } from "../services/public-tracking.service";

const ORDER = {
  id: "o-1",
  order_no: "TM-00002",
  user_id: "u-1",
  status: "in_transit",
  product_name: "Sony WH-1000XM5",
  product_url: "https://www.amazon.com/dp/B0",
  product_image_url: "https://img.test/a.jpg",
  // Selected nowhere by the public queries; here to prove nothing forwards them.
  carrier: "DHL",
  tracking_number: "7734 2201 9856",
  eta_from: "2026-10-08",
  eta_to: "2026-10-10",
  estimated_delivery_date: null,
  delivered_at: null,
  order_group_id: "g-1",
  delivery_address_id: null,
  est_from: null,
  est_to: null,
  platform: null,
};

const EVENTS = [
  { kind: "departed", title: "Departed New York", location: "JFK", weight_lbs: null, occurred_at: "2026-10-02T10:00:00Z" },
  { kind: "hub_received", title: "Arrived at our US hub", location: "US hub", weight_lbs: 0.6, occurred_at: "2026-09-30T10:00:00Z" },
  { kind: "payment_received", title: "Payment received", location: null, weight_lbs: null, occurred_at: "2026-09-25T10:00:00Z" },
];

/** Things a stranger must never see, whatever the lookup returned. */
const PII = ["kwame@tomame.local", "0192", "555", "u-1", "g-1", "total_ghs", "price", "pricing", "address", "phone", "email", "Signed by", "carrier", "DHL", "7734", "tracking_number", "trackingNumber", "trackingUrl"];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true } as never);
  vi.mocked(q.listTrackingEvents).mockResolvedValue(EVENTS as never);
  vi.mocked(q.getOrderPhones).mockResolvedValue(["024 555 0192"]);
  vi.mocked(q.getOrderOwnerEmail).mockResolvedValue("kwame@tomame.local");
  vi.mocked(q.peekRateLimitCount).mockResolvedValue({ count: 0, resetAt: Date.now() + 60 * 60 * 1000 });
});

const PER_ADDRESS = "track-verify:TM-00002:203.0.113.9";
const PER_REFERENCE = "track-verify:TM-00002";
const keysHit = () => vi.mocked(checkRateLimit).mock.calls.map(([key]) => key);

describe("classifyTrackingQuery", () => {
  it("reads a Tomame reference however it is typed", () => {
    expect(classifyTrackingQuery("tm 42")).toEqual({ kind: "reference", orderNo: "TM-00042" });
    expect(classifyTrackingQuery("TM-00042")).toEqual({ kind: "reference", orderNo: "TM-00042" });
  });

  it("does not accept carrier, store or waybill numbers: they are internal", () => {
    expect(classifyTrackingQuery("1Z 999 AA1 0123 4567 84")).toEqual({ kind: "invalid" });
    expect(classifyTrackingQuery("TBA123456789012")).toEqual({ kind: "invalid" });
    expect(classifyTrackingQuery("9400111899223197428490")).toEqual({ kind: "invalid" });
  });

  it("forgives punctuation, a #, the word order, lowercase and extra zeros", () => {
    const ref = { kind: "reference", orderNo: "TM-00042" };
    for (const raw of ["#TM-00042", "Order TM-00042", "order #tm-42", "(TM-00042).", "  tm-00042!  ", "TM-000042", "Order: TM 0000042", "tm_42"]) {
      expect(classifyTrackingQuery(raw), raw).toEqual(ref);
    }
    expect(classifyTrackingQuery("TM-123456")).toEqual({ kind: "reference", orderNo: "TM-123456" });
    expect(classifyTrackingQuery("TM-00000")).toEqual({ kind: "invalid" });
    expect(classifyTrackingQuery("Order 42")).toEqual({ kind: "invalid" });
  });

  it("refuses short or junk queries", () => {
    expect(classifyTrackingQuery("")).toEqual({ kind: "invalid" });
    expect(classifyTrackingQuery("12345678")).toEqual({ kind: "invalid" });
    expect(classifyTrackingQuery("x".repeat(90))).toEqual({ kind: "invalid" });
  });
});

describe("looksLikeTomameNumber", () => {
  it("is true for TM numbers only", () => {
    expect(looksLikeTomameNumber("tm-42")).toBe(true);
    expect(looksLikeTomameNumber("1Z999AA10123456784")).toBe(false);
    expect(looksLikeTomameNumber("headphones")).toBe(false);
  });
});

describe("the second factor", () => {
  it("accepts four digits, a full phone number (last four kept) or an email", () => {
    expect(parseVerifier("0192")).toEqual({ kind: "phone_last4", digits: "0192" });
    expect(parseVerifier("024 555 0192")).toEqual({ kind: "phone_last4", digits: "0192" });
    expect(parseVerifier("+233 (24) 555-0192")).toEqual({ kind: "phone_last4", digits: "0192" });
    expect(parseVerifier("01920")).toEqual({ kind: "phone_last4", digits: "1920" });
    expect(parseVerifier(" Kwame@Tomame.local ")).toEqual({ kind: "email", email: "kwame@tomame.local" });
    expect(parseVerifier("192")).toBeNull();
    expect(parseVerifier("ab12")).toBeNull();
    expect(parseVerifier("kwame")).toBeNull();
  });

  it("matches the last four of any phone on file, or the email", () => {
    const onFile = { phones: ["+233 24 555 0192"], email: "kwame@tomame.local" };
    expect(verifierMatches({ kind: "phone_last4", digits: "0192" }, onFile)).toBe(true);
    expect(verifierMatches({ kind: "phone_last4", digits: "0193" }, onFile)).toBe(false);
    expect(verifierMatches({ kind: "email", email: "kwame@tomame.local" }, onFile)).toBe(true);
    expect(verifierMatches({ kind: "email", email: "other@x.test" }, { phones: [], email: null })).toBe(false);
  });
});

describe("lookupPublicTracking", () => {
  it("answers every miss with the same shape", async () => {
    expect(await lookupPublicTracking({ query: "nope", viewerId: null })).toEqual(TRACKING_NOT_FOUND);
    expect(await lookupPublicTracking({ query: "TM-99999", viewerId: null })).toEqual({ found: false });
    // Carrier numbers are internal: not found, and no order is even read.
    vi.mocked(q.getTrackingOrderByNo).mockClear();
    expect(await lookupPublicTracking({ query: "1Z999AA10123456784", viewerId: null })).toEqual({ found: false });
    expect(q.getTrackingOrderByNo).not.toHaveBeenCalled();
  });

  it("shows only the stage for a bare reference: no product, dates, places or carrier", async () => {
    vi.mocked(q.getTrackingOrderByNo).mockResolvedValue(ORDER as never);
    const res = await lookupPublicTracking({ query: "tm-2", viewerId: null });
    expect(res).toMatchObject({ found: true, detail: "coarse", reference: "TM-00002", stageLabel: expect.any(String) });
    const text = JSON.stringify(res);
    for (const word of [...PII, "Sony", "img.test", "JFK", "Departed"]) expect(text).not.toContain(word);
    if (res.found) {
      expect(res.track.stops.every((s) => s.at === null && s.note === null)).toBe(true);
      expect(res.track.stops.find((s) => s.key === "in_the_air")?.state).toBe("now");
    }
  });

  it("shows the full journey once the last four digits of the phone match, still with no PII", async () => {
    vi.mocked(q.getTrackingOrderByNo).mockResolvedValue(ORDER as never);
    const res = await lookupPublicTracking({ query: "TM-00002", verifier: "0192", viewerId: null, ip: "203.0.113.9" });
    expect(res).toMatchObject({
      found: true,
      detail: "full",
      product: { name: "Sony WH-1000XM5", store: "Amazon" },
      ownerHref: null,
    });
    const text = JSON.stringify(res);
    for (const word of PII) expect(text).not.toContain(word);
    // A right answer spends the per-address budget only, never the reference's.
    expect(keysHit()).toEqual([PER_ADDRESS]);
  });

  it("accepts a full phone number and compares its last four digits", async () => {
    vi.mocked(q.getTrackingOrderByNo).mockResolvedValue(ORDER as never);
    const res = await lookupPublicTracking({ query: "TM-00002", verifier: "+233 24 555 0192", viewerId: null });
    expect(res).toMatchObject({ detail: "full" });
  });

  it("says when the second factor is wrong, stays coarse, and counts the miss against the reference", async () => {
    vi.mocked(q.getTrackingOrderByNo).mockResolvedValue(ORDER as never);
    const res = await lookupPublicTracking({ query: "TM-00002", verifier: "1111", viewerId: null, ip: "203.0.113.9" });
    expect(res).toMatchObject({ found: true, detail: "coarse", verify: { kind: "mismatch" } });
    expect(keysHit()).toEqual([PER_ADDRESS, PER_REFERENCE]);
  });

  it("says no phone is on file rather than 'does not match', and does not count it", async () => {
    vi.mocked(q.getTrackingOrderByNo).mockResolvedValue(ORDER as never);
    vi.mocked(q.getOrderPhones).mockResolvedValue([]);
    const res = await lookupPublicTracking({ query: "TM-00002", verifier: "0192", viewerId: null, ip: "203.0.113.9" });
    expect(res).toMatchObject({ detail: "coarse", verify: { kind: "no_phone_on_file" } });
    expect(keysHit()).toEqual([PER_ADDRESS]);
  });

  it("does not count input that is neither an email nor four digits", async () => {
    vi.mocked(q.getTrackingOrderByNo).mockResolvedValue(ORDER as never);
    for (const verifier of ["12", "hello", "ab12"]) {
      const res = await lookupPublicTracking({ query: "TM-00002", verifier, viewerId: null });
      expect(res).toMatchObject({ detail: "coarse", verify: { kind: "invalid" } });
    }
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(q.peekRateLimitCount).not.toHaveBeenCalled();
  });

  it("locks out with its own answer when the address is over budget, and leaves the reference counter alone", async () => {
    vi.mocked(q.getTrackingOrderByNo).mockResolvedValue(ORDER as never);
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 12 * 60 * 1000 } as never);
    const res = await lookupPublicTracking({ query: "TM-00002", verifier: "0192", viewerId: null, ip: "203.0.113.9" });
    expect(res).toMatchObject({ detail: "coarse", verify: { kind: "limited", retryInMinutes: 12 } });
    expect(keysHit()).toEqual([PER_ADDRESS]);
    expect(q.peekRateLimitCount).not.toHaveBeenCalled();
    expect(q.getOrderPhones).not.toHaveBeenCalled();
  });

  it("stops checking once the reference's misses reach the ceiling, even with the right answer", async () => {
    vi.mocked(q.getTrackingOrderByNo).mockResolvedValue(ORDER as never);
    vi.mocked(q.peekRateLimitCount).mockResolvedValue({ count: 20, resetAt: Date.now() + 30 * 60 * 1000 });
    const res = await lookupPublicTracking({ query: "TM-00002", verifier: "0192", viewerId: null, ip: "203.0.113.9" });
    expect(res).toMatchObject({ detail: "coarse", verify: { kind: "limited", retryInMinutes: 30 } });
    expect(q.peekRateLimitCount).toHaveBeenCalledWith(PER_REFERENCE, 3600);
    expect(q.getOrderPhones).not.toHaveBeenCalled();
    expect(keysHit()).toEqual([PER_ADDRESS]);
  });

  it("answers a failed read of what is on file as our error, not a mismatch, and logs it", async () => {
    vi.mocked(q.getTrackingOrderByNo).mockResolvedValue(ORDER as never);
    vi.mocked(q.getOrderOwnerEmail).mockRejectedValue(new Error("auth down"));
    const res = await lookupPublicTracking({ query: "TM-00002", verifier: "kwame@tomame.local", viewerId: null });
    expect(res).toMatchObject({ detail: "coarse", verify: { kind: "error" } });
    expect(logger.error).toHaveBeenCalled();
    expect(keysHit()).not.toContain(PER_REFERENCE);
  });

  it("gives the signed-in owner the full view and a link to their order", async () => {
    vi.mocked(q.getTrackingOrderByNo).mockResolvedValue(ORDER as never);
    const res = await lookupPublicTracking({ query: "TM-00002", viewerId: "u-1" });
    expect(res).toMatchObject({ detail: "full", ownerHref: "/app/orders/o-1" });
    for (const word of ["carrier", "DHL", "7734"]) expect(JSON.stringify(res)).not.toContain(word);
  });
});
