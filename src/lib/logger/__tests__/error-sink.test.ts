import { describe, it, expect } from "vitest";

import { fingerprintOf, redactMeta } from "@/lib/logger/error-sink";

describe("fingerprintOf", () => {
  it("groups the same failure across different ids, so the list is issues and not a log", () => {
    const a = fingerprintOf("linkOrderToPayment failed for 8d6677b3-8b78-4ed5-a384-d4e5b80606d0", "orders");
    const b = fingerprintOf("linkOrderToPayment failed for c8c504bf-81ed-411b-87f8-c75a5f7d33a0", "orders");
    expect(a).toBe(b);
  });

  it("groups across differing numbers and quoted values", () => {
    expect(fingerprintOf('Paystack API error: 502 for "TOM_1"', null)).toBe(
      fingerprintOf('Paystack API error: 503 for "TOM_2"', null),
    );
  });

  it("separates the same words from different places", () => {
    expect(fingerprintOf("timed out", "api:/api/orders")).not.toBe(fingerprintOf("timed out", "cron:catalog-scrape"));
  });

  it("separates genuinely different failures", () => {
    expect(fingerprintOf("could not read the price", "x")).not.toBe(fingerprintOf("could not reach the store", "x"));
  });

  it("is a stable 32 character hex id", () => {
    expect(fingerprintOf("anything", null)).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("redactMeta", () => {
  it("never stores a secret, whatever the call site passed", () => {
    const out = redactMeta({ apiKey: "sk_live_abc", authorization: "Bearer x", cronSecret: "s" })!;
    expect(Object.values(out)).toEqual(["[redacted]", "[redacted]", "[redacted]"]);
  });

  it("never stores anything that names a person", () => {
    const out = redactMeta({ email: "a@b.com", first_name: "Kwame", deliveryAddress: "12 Oxford St" })!;
    expect(Object.values(out).every((v) => v === "[redacted]")).toBe(true);
  });

  it("keeps ids and metrics, which are the diagnostic part", () => {
    expect(redactMeta({ orderId: "8d6677b3", attempts: 3, ok: false })).toEqual({
      orderId: "8d6677b3",
      attempts: 3,
      ok: false,
    });
  });

  it("reduces a product URL to its host, so what broke survives and whose it was does not", () => {
    expect(redactMeta({ url: "https://www.amazon.com/dp/B0D1XD1ZV3?tag=someone" })).toEqual({ url: "www.amazon.com" });
  });

  it("truncates a long string rather than storing a page of it", () => {
    const out = redactMeta({ body: "x".repeat(5000) })! as { body: string };
    expect(out.body.length).toBeLessThan(400);
  });

  it("redacts nested objects too", () => {
    expect(redactMeta({ outer: { password: "p", count: 2 } })).toEqual({ outer: { password: "[redacted]", count: 2 } });
  });

  it("answers null for no meta at all", () => {
    expect(redactMeta(undefined)).toBeNull();
  });
});
