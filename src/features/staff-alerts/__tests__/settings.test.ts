import { describe, expect, it } from "vitest";

import {
  DEFAULT_STAFF_RECIPIENTS,
  STAFF_ALERT_EVENTS,
  normaliseEvents,
  resolveStaffRecipients,
  staffAlertSettingsSchema,
  staffEventsSchema,
  staffRecipientsSchema,
} from "../settings";

describe("staff recipients", () => {
  it("lower-cases, trims and de-duplicates", () => {
    const parsed = staffRecipientsSchema.parse([" Albert.Ahadjie@Outlook.com ", "albert.ahadjie@outlook.com", "b@x.io"]);
    expect(parsed).toEqual(["albert.ahadjie@outlook.com", "b@x.io"]);
  });

  it("refuses an empty list, a bad address and more than 20", () => {
    expect(staffRecipientsSchema.safeParse([]).success).toBe(false);
    expect(staffRecipientsSchema.safeParse(["not-an-email"]).success).toBe(false);
    expect(staffRecipientsSchema.safeParse(Array.from({ length: 21 }, (_, i) => `a${i}@x.io`)).success).toBe(false);
  });

  it("resolves env first, then the setting, then the owner's three", () => {
    expect(resolveStaffRecipients("sink@example.com, bad", ["a@x.io"])).toEqual({ recipients: ["sink@example.com"], from: "env" });
    expect(resolveStaffRecipients(undefined, ["A@x.io", "junk"])).toEqual({ recipients: ["a@x.io"], from: "setting" });
    expect(resolveStaffRecipients(undefined, null)).toEqual({ recipients: [...DEFAULT_STAFF_RECIPIENTS], from: "default" });
    expect(DEFAULT_STAFF_RECIPIENTS).toEqual(["albert.ahadjie@outlook.com", "benjaminbennin@yahoo.com", "kelanimdev@gmail.com"]);
  });
});

describe("event toggles", () => {
  it("treats a missing key or a junk value as on, only false as off", () => {
    const out = normaliseEvents({ payment_failed: false, order_review: "no", unknown_event: false });
    expect(Object.keys(out)).toEqual([...STAFF_ALERT_EVENTS]);
    expect(out.payment_failed).toBe(false);
    expect(out.order_review).toBe(true);
    expect(out.order_placed).toBe(true);
    expect(normaliseEvents(null).car_order).toBe(true);
  });

  it("the schema rejects unknown events and non-booleans and fills the rest", () => {
    expect(staffEventsSchema.safeParse({ nope: true }).success).toBe(false);
    expect(staffEventsSchema.safeParse({ order_placed: "yes" }).success).toBe(false);
    expect(staffEventsSchema.parse({ order_placed: false })).toMatchObject({ order_placed: false, payment_succeeded: true });
  });

  it("the settings body needs both halves", () => {
    expect(staffAlertSettingsSchema.safeParse({ recipients: ["a@x.io"] }).success).toBe(false);
    expect(staffAlertSettingsSchema.safeParse({ recipients: ["a@x.io"], events: {} }).success).toBe(true);
  });
});
