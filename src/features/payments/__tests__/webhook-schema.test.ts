import { describe, expect, it } from "vitest";

import { paystackWebhookSchema } from "@/features/payments/schema";

/**
 * The schema is the endpoint's front door, and it is the piece that was
 * actually turning healthy deliveries away.
 *
 * ONE URL RECEIVES EVERY EVENT ON THE ACCOUNT — Paystack has no per-event
 * subscription. The schema once required `data.amount` and `data.currency`,
 * which only the `charge.*` family carries, so every `transfer.*`,
 * `subscription.*` and `customeridentification.*` delivery was refused with a
 * 400. Paystack retries a non-2xx and counts it against endpoint health, so the
 * strictness bought nothing and spent the endpoint's reputation on events we
 * were going to ignore anyway.
 *
 * These tests exist because that bug is invisible from the service tests: they
 * hand `handleWebhookEvent` a literal and never go through the schema at all,
 * so tightening this object back up would break the endpoint with every test
 * still green.
 */
describe("paystackWebhookSchema", () => {
  it("accepts a charge.success and keeps the one field we read", () => {
    const parsed = paystackWebhookSchema.safeParse({
      event: "charge.success",
      data: {
        reference: "TOM_1757000000000_a1b2c3",
        status: "success",
        amount: 125_050,
        currency: "GHS",
      },
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.data.reference).toBe("TOM_1757000000000_a1b2c3");
  });

  /**
   * The regression that matters. Each of these is a real Paystack event family
   * that lands on this same URL and carries neither `amount` nor `currency`.
   */
  it.each([
    ["customeridentification.failed", { customer_code: "CUS_xxx", reason: "Invalid ID" }],
    ["subscription.create", { subscription_code: "SUB_xxx", status: "active" }],
    ["invoice.create", { invoice_code: "INV_xxx" }],
  ])("accepts a bystander %s delivery rather than 400ing it", (event, data) => {
    expect(paystackWebhookSchema.safeParse({ event, data }).success).toBe(true);
  });

  it("keeps unknown keys instead of stripping them", () => {
    const parsed = paystackWebhookSchema.safeParse({
      event: "transfer.success",
      data: { reference: "TRF_xxx", transfer_code: "TRF_code" },
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && (parsed.data.data as Record<string, unknown>).transfer_code).toBe(
      "TRF_code",
    );
  });

  it("still refuses a body that is not a Paystack envelope", () => {
    expect(paystackWebhookSchema.safeParse({ data: { reference: "x" } }).success).toBe(false);
    expect(paystackWebhookSchema.safeParse({ event: "charge.success" }).success).toBe(false);
    expect(paystackWebhookSchema.safeParse({ event: 42, data: {} }).success).toBe(false);
  });

  /**
   * A reference that is present but not a string is a different thing from one
   * that is absent, and only the second is legitimate. `handleWebhookEvent`
   * guards the absent case; this keeps the wrong-typed case out of it entirely.
   */
  it("refuses a reference of the wrong type", () => {
    expect(
      paystackWebhookSchema.safeParse({ event: "charge.success", data: { reference: 12345 } })
        .success,
    ).toBe(false);
  });
});
