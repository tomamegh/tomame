import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/email/transport", () => ({ sendEmail: vi.fn() }));
vi.mock("@/db/queries/staff-alerts", () => ({
  claimStaffAlertSend: vi.fn(),
  finishStaffAlertSend: vi.fn(),
  getStaffCarOrder: vi.fn(),
  getStaffCustomer: vi.fn(),
  getStaffGroup: vi.fn(),
  getStaffOrder: vi.fn(),
  getStaffPayment: vi.fn(),
  listStaffOrdersByGroup: vi.fn(),
  readSiteSettingValues: vi.fn(),
}));

import * as q from "@/db/queries/staff-alerts";
import { eventKeyOf } from "../notify";
import { processStaffAlert, sendStaffTestEmail, type StaffAlertTrigger } from "../staff-alerts.service";

const PROD = { NEXT_PUBLIC_APP_URL: "https://tomame.ca", NODE_ENV: "production" };
const DEV = { NEXT_PUBLIC_APP_URL: "https://dev.tomame.ca", NODE_ENV: "production" };

const ORDER = {
  id: "11111111-1111-1111-1111-111111111111",
  order_no: "TM-00042",
  user_id: "u1",
  status: "paid",
  product_name: "Sony <WH-1000XM5> & case",
  product_url: "https://amazon.com/x",
  quantity: 2,
  origin_country: "USA",
  pricing: { total_ghs: 1234 },
  admin_total_ghs: null,
  needs_review: false,
  review_reasons: [],
  payment_id: "p1",
  order_group_id: null,
  tracking_number: null,
  carrier: null,
  created_at: "2026-10-01T10:00:00Z",
};
const PAYMENT = {
  id: "p1",
  user_id: "u1",
  reference: "TMR_abc",
  amount: 123400,
  currency: "GHS",
  status: "success",
  channel: "mobile_money",
  metadata: { order_id: ORDER.id },
  order_group_id: null,
  car_order_id: null,
};

const deps = (env: Record<string, string> = PROD, send = vi.fn().mockResolvedValue(undefined)) => ({ send, env });

let claimed: Set<string>;

beforeEach(() => {
  vi.clearAllMocks();
  claimed = new Set();
  // The unique index, in memory: the second INSERT of a key gets null.
  vi.mocked(q.claimStaffAlertSend).mockImplementation(async (row) => {
    if (claimed.has(row.event_key)) return null;
    claimed.add(row.event_key);
    return claimed.size;
  });
  vi.mocked(q.readSiteSettingValues).mockResolvedValue({
    staff_order_alert_recipients: ["a@x.io", "b@x.io"],
    staff_order_alert_events: {},
  });
  vi.mocked(q.getStaffOrder).mockResolvedValue(ORDER as never);
  vi.mocked(q.getStaffPayment).mockResolvedValue(PAYMENT as never);
  vi.mocked(q.getStaffCustomer).mockResolvedValue({ name: "Kwame Mensah", email: "kwame@example.com", phone: "+233 24 412 3456" });
});

describe("processStaffAlert", () => {
  it("a double payment success (verify + webhook) sends one email per recipient, once", async () => {
    const d = deps();
    const trigger: StaffAlertTrigger = { kind: "payment_succeeded", paymentId: "p1" };
    const [first, second] = await Promise.all([processStaffAlert(trigger, d), processStaffAlert(trigger, d)]);
    expect([first.status, second.status].sort()).toEqual(["duplicate", "sent"]);
    expect(d.send).toHaveBeenCalledTimes(2);
    expect(d.send.mock.calls.map((c) => c[0].to)).toEqual(["a@x.io", "b@x.io"]);
    expect(q.finishStaffAlertSend).toHaveBeenCalledTimes(1);
    expect(q.finishStaffAlertSend).toHaveBeenCalledWith(1, expect.objectContaining({ status: "sent", recipients: 2, failed_recipients: 0 }));
  });

  it("an event switched off claims nothing and sends nothing", async () => {
    vi.mocked(q.readSiteSettingValues).mockResolvedValue({ staff_order_alert_events: { payment_succeeded: false } });
    const d = deps();
    expect(await processStaffAlert({ kind: "payment_succeeded", paymentId: "p1" }, d)).toEqual({ status: "off" });
    expect(q.claimStaffAlertSend).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
  });

  it("dev records the event as skipped and never sends", async () => {
    const d = deps(DEV);
    const out = await processStaffAlert({ kind: "order_placed", orderId: ORDER.id }, d);
    expect(out).toMatchObject({ status: "skipped" });
    expect((out as { subject: string }).subject).toBe("[Tomame dev] New order TM-00042 · GH₵1,234.00");
    expect(d.send).not.toHaveBeenCalled();
    expect(q.finishStaffAlertSend).toHaveBeenCalledWith(1, expect.objectContaining({ status: "skipped" }));
  });

  it("retries a recipient up to three times, then records failed", async () => {
    const send = vi.fn().mockRejectedValue(new Error("Resend error: boom"));
    const out = await processStaffAlert({ kind: "order_placed", orderId: ORDER.id }, deps(PROD, send));
    expect(out).toMatchObject({ status: "failed" });
    expect(send).toHaveBeenCalledTimes(6);
    expect(q.finishStaffAlertSend).toHaveBeenCalledWith(1, expect.objectContaining({ status: "failed", attempts: 3, failed_recipients: 2 }));
  });

  it("a recipient that recovers on the second try is delivered", async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error("blip")).mockResolvedValue(undefined);
    const out = await processStaffAlert({ kind: "order_placed", orderId: ORDER.id }, deps(PROD, send));
    expect(out).toMatchObject({ status: "sent", failed: 0 });
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("a missing order is recorded as failed, not thrown", async () => {
    vi.mocked(q.getStaffOrder).mockResolvedValue(null);
    const out = await processStaffAlert({ kind: "order_placed", orderId: "gone" }, deps());
    expect(out).toMatchObject({ status: "failed" });
    expect(q.finishStaffAlertSend).toHaveBeenCalledWith(1, expect.objectContaining({ status: "failed" }));
  });

  it("the email names the event, order, customer, items, total, payment and admin link, escaped", async () => {
    const d = deps();
    await processStaffAlert({ kind: "payment_succeeded", paymentId: "p1" }, d);
    const mail = d.send.mock.calls[0]![0] as { subject: string; html: string; text: string };
    expect(mail.subject).toBe("[Tomame] Payment received TM-00042 · GH₵1,234.00");
    expect(mail.html).toContain("Sony &lt;WH-1000XM5&gt; &amp; case");
    expect(mail.html).not.toContain("<WH-1000XM5>");
    for (const s of ["Kwame Mensah", "kwame@example.com", "+233 24 412 3456", "TMR_abc", "TM-00042", `/admin/orders/${ORDER.id}`]) {
      expect(mail.html).toContain(s);
    }
    expect(mail.text).toContain("Payment received");
    expect(mail.text).toContain("GH₵1,234.00");
    expect(mail.text).toContain("Kwame Mensah");
  });

  it("STAFF_ALERT_RECIPIENTS replaces the saved list", async () => {
    const d = deps({ ...PROD, STAFF_ALERT_RECIPIENTS: "sink@example.com" });
    await processStaffAlert({ kind: "order_status", orderId: ORDER.id, from: "paid", to: "processing", by: "admin@x.io" }, d);
    expect(d.send.mock.calls.map((c) => c[0].to)).toEqual(["sink@example.com"]);
    expect(d.send.mock.calls[0]![0].subject).toBe("[Tomame] Order TM-00042 processing");
  });
});

describe("event keys", () => {
  it("one key per event per order", () => {
    expect(eventKeyOf({ kind: "payment_succeeded", paymentId: "p1" })).toBe("payment_succeeded:p1");
    expect(eventKeyOf({ kind: "payment_failed", paymentId: "p1", reason: "expired" })).toBe(
      eventKeyOf({ kind: "payment_failed", paymentId: "p1", reason: "declined" }),
    );
    expect(eventKeyOf({ kind: "order_status", orderId: "o", from: "paid", to: "processing", by: "x" })).not.toBe(
      eventKeyOf({ kind: "order_status", orderId: "o", from: "processing", to: "in_transit", by: "x" }),
    );
    expect(eventKeyOf({ kind: "order_placed", orderId: "g" })).not.toBe(eventKeyOf({ kind: "bag_placed", groupId: "g" }));
  });
});

describe("sendStaffTestEmail", () => {
  it("sends even on dev, to the saved list, with the dev prefix", async () => {
    const d = deps(DEV);
    const out = await sendStaffTestEmail("admin@x.io", d);
    expect(out).toMatchObject({ status: "sent", recipients: 2 });
    expect(d.send.mock.calls[0]![0].subject).toBe("[Tomame dev] Test: staff order alerts are working");
  });
});
