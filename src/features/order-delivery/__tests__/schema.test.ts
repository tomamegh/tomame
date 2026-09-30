import { describe, expect, it } from "vitest";

import {
  courierHandoffSchema,
  detectCourierProvider,
  formatGhanaPhone,
  maskPhone,
  normaliseGhanaPhone,
  parseTrackingUrl,
} from "../schema";
import { courierHint, describeCourierPreview } from "../components/courier-format";

describe("normaliseGhanaPhone", () => {
  it.each([
    ["0244123456", "+233244123456"],
    ["024 412 3456", "+233244123456"],
    ["024-412-3456", "+233244123456"],
    ["+233244123456", "+233244123456"],
    ["+233 24 412 3456", "+233244123456"],
    ["233244123456", "+233244123456"],
    ["00233244123456", "+233244123456"],
    ["(+233) 0244123456", "+233244123456"],
    ["0302123456", "+233302123456"],
  ])("accepts %s", (raw, e164) => {
    expect(normaliseGhanaPhone(raw)).toBe(e164);
  });

  it.each([
    "",
    "024412345", // nine digits with a trunk 0
    "02441234567", // eleven
    "+44 7700 900123", // not Ghana
    "+2331244123456", // eleven after 233, not the trunk-0 slip
    "0044123456", // national number starting 0
    "call me",
  ])("rejects %s", (raw) => {
    expect(normaliseGhanaPhone(raw)).toBeNull();
  });

  it("prints and masks the stored form", () => {
    expect(formatGhanaPhone("+233244123456")).toBe("+233 24 412 3456");
    expect(maskPhone("+233244123456")).toBe("+233 24 *** 3456");
    expect(maskPhone(null)).toBeNull();
  });
});

describe("parseTrackingUrl", () => {
  it("accepts a plain https link", () => {
    expect(parseTrackingUrl(" https://yango.com/track/abc ")).toEqual({
      ok: true,
      url: "https://yango.com/track/abc",
    });
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "http://uber.com/track",
    "file:///etc/passwd",
    "uber.com/track",
    "https://uber.com@evil.example/track",
    "https://localhost/track",
  ])("refuses %s", (raw) => {
    expect(parseTrackingUrl(raw).ok).toBe(false);
  });
});

describe("detectCourierProvider", () => {
  it.each([
    ["https://uber.com/x", "uber"],
    ["https://m.uber.com/looking", "uber"],
    ["https://t.uber.com/abc", "uber"],
    ["https://yango.com/share/1", "yango"],
    ["https://yango.go.link/abc", "yango"],
    ["https://go.yandex/route/1", "yango"],
    ["https://bolt.eu/r/abc", "bolt"],
    ["https://example.com/track", "other"],
    // Suffix matching is on a dot boundary: these are not the providers.
    ["https://uber.com.evil.example/x", "other"],
    ["https://notuber.com/x", "other"],
  ])("%s is %s", (url, provider) => {
    expect(detectCourierProvider(url)).toBe(provider);
  });
});

describe("courierHandoffSchema", () => {
  it("normalises the phone and derives the provider from the link", () => {
    const parsed = courierHandoffSchema.parse({
      courier_name: "  Kofi ",
      courier_phone: "024 412 3456",
      tracking_url: "https://yango.go.link/abc",
    });
    expect(parsed).toEqual({
      courier_name: "Kofi",
      courier_phone: "+233244123456",
      tracking_url: "https://yango.go.link/abc",
      provider: "yango",
    });
  });

  it("accepts a phone alone and a link alone", () => {
    expect(courierHandoffSchema.parse({ courier_phone: "0244123456" })).toMatchObject({
      courier_phone: "+233244123456",
      tracking_url: null,
      provider: null,
      courier_name: null,
    });
    expect(courierHandoffSchema.parse({ tracking_url: "https://m.uber.com/x" })).toMatchObject({
      courier_phone: null,
      provider: "uber",
    });
  });

  it("requires one way to reach the rider", () => {
    const result = courierHandoffSchema.safeParse({ courier_name: "Kofi" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/phone number or a tracking link/);
  });

  it("refuses a bad phone, a bad link, and a client-chosen provider", () => {
    expect(courierHandoffSchema.safeParse({ courier_phone: "12345" }).success).toBe(false);
    expect(courierHandoffSchema.safeParse({ tracking_url: "javascript:alert(1)" }).success).toBe(false);
    expect(
      courierHandoffSchema.safeParse({ tracking_url: "https://evil.example", provider: "uber" }).success,
    ).toBe(false);
  });
});

describe("describeCourierPreview", () => {
  it("says what the customer will read", () => {
    const preview = describeCourierPreview({
      name: "Kofi",
      phone: "0244123456",
      trackingUrl: "https://yango.com/t/1",
    });
    expect(preview.line).toBe(
      "Kofi has your package on Yango and is heading to you. Call +233 24 412 3456. Track your rider on Yango.",
    );
    expect(preview.problem).toBeNull();
  });

  it("names the problem before the admin can send", () => {
    expect(describeCourierPreview({ name: "", phone: "", trackingUrl: "" }).problem).toMatch(/phone number or a tracking link/);
    expect(describeCourierPreview({ name: "", phone: "123", trackingUrl: "" }).problem).toMatch(/Ghana number/);
    expect(describeCourierPreview({ name: "", phone: "", trackingUrl: "http://x.com" }).problem).toMatch(/https/);
  });
});

describe("courierHint", () => {
  const courier = {
    orderId: "o1",
    name: null,
    phone: "+233244123456",
    trackingUrl: "https://bolt.eu/r/1",
    provider: "bolt" as const,
    dispatchedAt: "2026-09-30T10:00:00Z",
    dispatchedBy: "a1",
    lastNotifiedAt: "2026-09-30T10:00:00Z",
  };

  it("shows only while in transit", () => {
    expect(courierHint(courier, "in_transit")).toEqual({ text: "Rider on the way", trackingUrl: "https://bolt.eu/r/1" });
    expect(courierHint(courier, "delivered")).toBeNull();
    expect(courierHint(null, "in_transit")).toBeNull();
  });
});
