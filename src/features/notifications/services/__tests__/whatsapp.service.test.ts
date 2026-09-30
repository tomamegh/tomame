import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

// Env is read live through getters, so each test sets process.env.
vi.mock("@/lib/env", () => ({
  env: {
    whatsapp: {
      get accessToken() { return process.env.WHATSAPP_ACCESS_TOKEN || null; },
      get phoneNumberId() { return process.env.WHATSAPP_PHONE_NUMBER_ID || null; },
      get apiVersion() { return null; },
      get apiBaseUrl() { return "https://graph.example.test"; },
      get appSecret() { return null; },
      get verifyToken() { return null; },
    },
  },
}));

vi.mock("@/db/queries/whatsapp-notifications", () => ({
  getWhatsAppRecipient: vi.fn(),
  insertWhatsAppNotification: vi.fn(),
  listDueWhatsAppNotifications: vi.fn(),
  claimWhatsAppNotification: vi.fn(),
  updatePendingWhatsAppNotification: vi.fn(),
  findWhatsAppNotificationByMessageId: vi.fn(),
  updateWhatsAppDelivery: vi.fn(),
}));

import * as q from "@/db/queries/whatsapp-notifications";
import {
  applyWhatsAppStatuses,
  dispatchDueWhatsApp,
  nextDeliveryStatus,
  queueWhatsApp,
} from "../whatsapp.service";
import { whatsappMessages } from "@/lib/whatsapp/templates";

const recipient = vi.mocked(q.getWhatsAppRecipient);
const insert = vi.mocked(q.insertWhatsAppNotification);
const listDue = vi.mocked(q.listDueWhatsAppNotifications);
const claim = vi.mocked(q.claimWhatsAppNotification);
const updatePending = vi.mocked(q.updatePendingWhatsAppNotification);
const findByWamid = vi.mocked(q.findWhatsAppNotificationByMessageId);
const updateDelivery = vi.mocked(q.updateWhatsAppDelivery);

const USER = "11111111-1111-1111-1111-111111111111";
const paid = whatsappMessages.orderStatus({ orderId: "o1", productName: "Nike Air Max 90", status: "paid" });

function configure(on: boolean) {
  process.env.WHATSAPP_ACCESS_TOKEN = on ? "token" : "";
  process.env.WHATSAPP_PHONE_NUMBER_ID = on ? "555" : "";
}

beforeEach(() => {
  vi.clearAllMocks();
  configure(true);
  recipient.mockResolvedValue({ first_name: "Ama", phone: "024 412 3456", whatsapp_opt_in: true });
  insert.mockResolvedValue({ id: "n1" });
  claim.mockResolvedValue(true);
  updatePending.mockResolvedValue(undefined);
});

describe("queueWhatsApp gating", () => {
  it("writes nothing when the channel is not configured", async () => {
    configure(false);
    expect(await queueWhatsApp({ userId: USER, event: "order_paid", message: paid })).toBe("not_configured");
    expect(recipient).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("writes nothing for a customer who has not opted in", async () => {
    recipient.mockResolvedValue({ first_name: "Ama", phone: "0244123456", whatsapp_opt_in: false });
    expect(await queueWhatsApp({ userId: USER, event: "order_paid", message: paid })).toBe("opted_out");
    expect(insert).not.toHaveBeenCalled();
  });

  it("writes nothing without a usable phone", async () => {
    recipient.mockResolvedValue({ first_name: "Ama", phone: null, whatsapp_opt_in: true });
    expect(await queueWhatsApp({ userId: USER, event: "order_paid", message: paid })).toBe("no_phone");
    recipient.mockResolvedValue({ first_name: "Ama", phone: "12", whatsapp_opt_in: true });
    expect(await queueWhatsApp({ userId: USER, event: "order_paid", message: paid })).toBe("no_phone");
    expect(insert).not.toHaveBeenCalled();
  });

  it("writes nothing for an event with no message or no account", async () => {
    expect(await queueWhatsApp({ userId: USER, event: "x", message: null })).toBe("no_message");
    expect(await queueWhatsApp({ userId: null, event: "x", message: paid })).toBe("no_account");
    expect(insert).not.toHaveBeenCalled();
  });

  it("queues a pending row with the template, the name first and the button path", async () => {
    expect(await queueWhatsApp({ userId: USER, event: "order_paid", message: paid, dedupeKey: "order_status:o1:paid" })).toBe("queued");
    expect(insert).toHaveBeenCalledWith({
      user_id: USER,
      event: "order_paid",
      dedupe_key: "order_status:o1:paid",
      payload: {
        template_key: "order_paid",
        template: "tomame_order_paid",
        language: "en",
        params: ["Ama", "Nike Air Max 90"],
        button_path: "/app/orders/o1",
        preview: "Hi Ama, payment received for Nike Air Max 90. Thank you! Our buyers are on it, and we'll update you at every step.",
      },
    });
  });

  it("reports a duplicate and never throws on a database error", async () => {
    insert.mockResolvedValueOnce(null);
    expect(await queueWhatsApp({ userId: USER, event: "order_paid", message: paid })).toBe("duplicate");
    insert.mockRejectedValueOnce(new Error("boom"));
    expect(await queueWhatsApp({ userId: USER, event: "order_paid", message: paid })).toBe("error");
  });
});

const NOW = new Date("2026-09-30T12:00:00.000Z");

function row(over: Partial<q.WhatsAppNotificationRow> = {}): q.WhatsAppNotificationRow {
  return {
    id: "n1",
    user_id: USER,
    event: "order_paid",
    status: "pending",
    attempts: 0,
    next_attempt_at: null,
    provider_message_id: null,
    delivery_status: null,
    created_at: NOW.toISOString(),
    payload: { template_key: "order_paid", params: ["Ama", "Nike Air Max 90"], button_path: "/app/orders/o1" },
    ...over,
  };
}

const metaOk = () => vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.OK" }] }), { status: 200 }));
const metaError = (status: number, code: number) =>
  vi.fn(async () => new Response(JSON.stringify({ error: { code, message: "nope" } }), { status }));

describe("dispatchDueWhatsApp", () => {
  it("skips cleanly when not configured", async () => {
    configure(false);
    expect(await dispatchDueWhatsApp({ now: NOW })).toMatchObject({ skipped: "not_configured", checked: 0 });
    expect(listDue).not.toHaveBeenCalled();
  });

  it("claims, sends and marks sent with the wamid", async () => {
    listDue.mockResolvedValue([row()]);
    const fetchImpl = metaOk();
    const summary = await dispatchDueWhatsApp({ now: NOW, fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(summary).toMatchObject({ checked: 1, sent: 1, failed: 0, retrying: 0 });
    expect(claim).toHaveBeenCalledWith("n1", 0, expect.objectContaining({ attempts: 1 }));
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.to).toBe("233244123456");
    expect(body.template.components[1].parameters[0].text).toBe("app/orders/o1");
    expect(updatePending).toHaveBeenCalledWith("n1", expect.objectContaining({ status: "sent", provider_message_id: "wamid.OK", delivery_status: "accepted" }));
  });

  it("skips a row another run claimed", async () => {
    listDue.mockResolvedValue([row()]);
    claim.mockResolvedValue(false);
    const fetchImpl = metaOk();
    expect(await dispatchDueWhatsApp({ now: NOW, fetchImpl: fetchImpl as unknown as typeof fetch })).toMatchObject({ contended: 1, sent: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("backs off a retryable failure and stays pending", async () => {
    listDue.mockResolvedValue([row({ attempts: 0 })]);
    await dispatchDueWhatsApp({ now: NOW, fetchImpl: metaError(429, 130429) as unknown as typeof fetch });
    const fields = updatePending.mock.calls[0]![1];
    expect(fields.status).toBeUndefined();
    expect(fields.next_attempt_at).toBe("2026-09-30T12:01:00.000Z");
    expect(fields.error_code).toBe("130429");
  });

  it("fails after the third retryable attempt", async () => {
    listDue.mockResolvedValue([row({ attempts: 2 })]);
    const summary = await dispatchDueWhatsApp({ now: NOW, fetchImpl: metaError(503, 131000) as unknown as typeof fetch });
    expect(summary.failed).toBe(1);
    expect(updatePending).toHaveBeenCalledWith("n1", expect.objectContaining({ status: "failed", delivery_status: "failed", error_code: "131000" }));
  });

  it("fails a permanent error on the first attempt", async () => {
    listDue.mockResolvedValue([row()]);
    await dispatchDueWhatsApp({ now: NOW, fetchImpl: metaError(400, 131026) as unknown as typeof fetch });
    expect(updatePending).toHaveBeenCalledWith("n1", expect.objectContaining({ status: "failed", error_code: "131026" }));
  });

  it("does not send to a customer who opted out after it was queued", async () => {
    listDue.mockResolvedValue([row()]);
    recipient.mockResolvedValue({ first_name: "Ama", phone: "0244123456", whatsapp_opt_in: false });
    const fetchImpl = metaOk();
    await dispatchDueWhatsApp({ now: NOW, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(updatePending).toHaveBeenCalledWith("n1", expect.objectContaining({ status: "failed", error_code: "opted_out" }));
  });

  it("fails a row whose params no longer match the template", async () => {
    listDue.mockResolvedValue([row({ payload: { template_key: "order_paid", params: ["Ama"] } })]);
    const fetchImpl = metaOk();
    await dispatchDueWhatsApp({ now: NOW, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(updatePending).toHaveBeenCalledWith("n1", expect.objectContaining({ status: "failed", error_code: "template_mismatch" }));
  });
});

describe("delivery status callbacks", () => {
  it("moves forward only; failed never overwrites a delivered message", () => {
    expect(nextDeliveryStatus("accepted", "sent")).toBe("sent");
    expect(nextDeliveryStatus("sent", "delivered")).toBe("delivered");
    expect(nextDeliveryStatus("delivered", "read")).toBe("read");
    expect(nextDeliveryStatus("read", "delivered")).toBeNull();
    expect(nextDeliveryStatus("delivered", "sent")).toBeNull();
    expect(nextDeliveryStatus("sent", "failed")).toBe("failed");
    expect(nextDeliveryStatus("delivered", "failed")).toBeNull();
    expect(nextDeliveryStatus("failed", "read")).toBeNull();
  });

  it("applies a read receipt, stamping delivered_at when the delivered callback never came", async () => {
    findByWamid.mockResolvedValue(row({ status: "sent", delivery_status: "accepted", provider_message_id: "wamid.OK" }));
    updateDelivery.mockResolvedValue(true);
    const summary = await applyWhatsAppStatuses([
      { messageId: "wamid.OK", status: "read", at: "2026-09-30T12:05:00.000Z", errorCode: null, errorReason: null },
    ]);
    expect(summary).toEqual({ updated: 1, ignored: 0, unknown: 0 });
    expect(updateDelivery).toHaveBeenCalledWith("n1", "accepted", {
      delivery_status: "read",
      delivered_at: "2026-09-30T12:05:00.000Z",
      seen_at: "2026-09-30T12:05:00.000Z",
    });
  });

  it("records a carrier failure with its reason, leaving status alone", async () => {
    findByWamid.mockResolvedValue(row({ status: "sent", delivery_status: "sent" }));
    updateDelivery.mockResolvedValue(true);
    await applyWhatsAppStatuses([
      { messageId: "wamid.OK", status: "failed", at: null, errorCode: "131026", errorReason: "Not on WhatsApp" },
    ]);
    const fields = updateDelivery.mock.calls[0]![2];
    expect(fields).toEqual({ delivery_status: "failed", error_code: "131026", error_reason: "Not on WhatsApp" });
    expect(fields).not.toHaveProperty("status");
  });

  it("counts unknown ids and stale callbacks without writing", async () => {
    findByWamid.mockResolvedValueOnce(null).mockResolvedValueOnce(row({ delivery_status: "read" }));
    const summary = await applyWhatsAppStatuses([
      { messageId: "wamid.X", status: "sent", at: null, errorCode: null, errorReason: null },
      { messageId: "wamid.Y", status: "delivered", at: null, errorCode: null, errorReason: null },
    ]);
    expect(summary).toEqual({ updated: 0, ignored: 1, unknown: 1 });
    expect(updateDelivery).not.toHaveBeenCalled();
  });
});
