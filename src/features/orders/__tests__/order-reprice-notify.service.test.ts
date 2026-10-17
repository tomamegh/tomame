import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { app: { url: "https://tomame.test" } } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/db/queries/audit-logs", () => ({ listAuditLogsSince: vi.fn() }));
vi.mock("@/db/queries/notifications", () => ({ findLatestNotificationFor: vi.fn() }));
vi.mock("@/db/queries/order-groups", () => ({ getOrderGroupById: vi.fn() }));
vi.mock("@/features/orders/services/orders.service", () => ({ getOrderById: vi.fn() }));
vi.mock("@/features/notifications/services/customer-notify.service", () => ({ notifyCustomer: vi.fn() }));

import { listAuditLogsSince, type AuditLogRow } from "@/db/queries/audit-logs";
import { findLatestNotificationFor } from "@/db/queries/notifications";
import { getOrderGroupById } from "@/db/queries/order-groups";
import { notifyCustomer } from "@/features/notifications/services/customer-notify.service";
import { notifyRepricedTotals } from "@/features/orders/services/order-reprice-notify.service";
import { getOrderById } from "@/features/orders/services/orders.service";

const NOW = new Date("2026-10-17T03:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

const groupAudit = (from: number, to: number, ago: number): AuditLogRow => ({
  entity_type: "order_group", entity_id: "g1", action: "order_group_repriced",
  metadata: { total_ghs: { from, to } }, created_at: minutesAgo(ago),
});
const lineAudit = (ago: number): AuditLogRow => ({
  entity_type: "order", entity_id: "o9", action: "order_repriced",
  metadata: { order_group_id: "g1", total_ghs: { from: 840.34, to: 890.34 } }, created_at: minutesAgo(ago),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findLatestNotificationFor).mockResolvedValue(null);
  vi.mocked(getOrderGroupById).mockResolvedValue({ id: "g1", user_id: "u1", status: "pending", total_ghs: 930.34, item_count: 2 } as never);
});

describe("notifyRepricedTotals", () => {
  it("tells the customer once the bag's total has settled, old against new", async () => {
    vi.mocked(listAuditLogsSince).mockResolvedValue([lineAudit(30), groupAudit(880.34, 930.34, 30)]);

    expect(await notifyRepricedTotals(NOW)).toEqual({ notified: 1 });
    const call = vi.mocked(notifyCustomer).mock.calls[0]![0];
    expect(call).toMatchObject({
      userId: "u1",
      event: "order_repriced",
      payload: { target_id: "g1", order_group_id: "g1", from_ghs: 880.34, to_ghs: 930.34, href: "/app/bag" },
      whatsapp: { dedupeKey: "order_repriced:group:g1:93034", message: { template: "order_repriced", params: ["your bag of 2 items", "880.34", "930.34"] } },
    });
    expect(call.template.subject).toBe("Your Tomame total has changed");
    expect(call.template.html).toContain("https://tomame.test/app/bag");
  });

  it("waits while the admin is still editing", async () => {
    vi.mocked(listAuditLogsSince).mockResolvedValue([groupAudit(880.34, 930.34, 30), groupAudit(930.34, 950.34, 4)]);
    expect(await notifyRepricedTotals(NOW)).toEqual({ notified: 0 });
  });

  it("compares with the checkout total across several edits", async () => {
    vi.mocked(listAuditLogsSince).mockResolvedValue([groupAudit(880.34, 900, 40), groupAudit(900, 930.34, 20)]);
    await notifyRepricedTotals(NOW);
    expect(vi.mocked(notifyCustomer).mock.calls[0]![0].payload).toMatchObject({ from_ghs: 880.34, to_ghs: 930.34 });
  });

  it("says nothing when the change was undone", async () => {
    vi.mocked(listAuditLogsSince).mockResolvedValue([groupAudit(880.34, 930.34, 40), groupAudit(930.34, 880.34, 20)]);
    vi.mocked(getOrderGroupById).mockResolvedValue({ id: "g1", user_id: "u1", status: "pending", total_ghs: 880.34, item_count: 2 } as never);
    expect(await notifyRepricedTotals(NOW)).toEqual({ notified: 0 });
  });

  it("does not repeat a notice the customer already has", async () => {
    vi.mocked(listAuditLogsSince).mockResolvedValue([groupAudit(880.34, 930.34, 30)]);
    vi.mocked(findLatestNotificationFor).mockResolvedValue({ payload: { to_ghs: 930.34 } } as never);
    expect(await notifyRepricedTotals(NOW)).toEqual({ notified: 0 });
  });

  it("starts from the last notice when the total moves again", async () => {
    vi.mocked(listAuditLogsSince).mockResolvedValue([groupAudit(880.34, 930.34, 50), groupAudit(930.34, 905, 20)]);
    vi.mocked(getOrderGroupById).mockResolvedValue({ id: "g1", user_id: "u1", status: "pending", total_ghs: 905, item_count: 2 } as never);
    vi.mocked(findLatestNotificationFor).mockResolvedValue({ payload: { to_ghs: 930.34 } } as never);

    await notifyRepricedTotals(NOW);
    const call = vi.mocked(notifyCustomer).mock.calls[0]![0];
    expect(call.payload).toMatchObject({ from_ghs: 930.34, to_ghs: 905 });
    expect(call.template.subject).toBe("Good news: your Tomame total went down");
  });

  it("skips a bag that has been paid since", async () => {
    vi.mocked(listAuditLogsSince).mockResolvedValue([groupAudit(880.34, 930.34, 30)]);
    vi.mocked(getOrderGroupById).mockResolvedValue({ id: "g1", user_id: "u1", status: "paid", total_ghs: 930.34, item_count: 2 } as never);
    expect(await notifyRepricedTotals(NOW)).toEqual({ notified: 0 });
  });

  it("tells a single order through its order page", async () => {
    vi.mocked(listAuditLogsSince).mockResolvedValue([{
      entity_type: "order", entity_id: "o1", action: "order_repriced",
      metadata: { order_group_id: null, total_ghs: { from: 500, to: 560 } }, created_at: minutesAgo(15),
    }]);
    vi.mocked(getOrderById).mockResolvedValue({
      id: "o1", user_id: "u2", status: "pending", needs_review: false, admin_total_ghs: null, product_name: "Pixel 9", pricing: { total_ghs: 560 },
    } as never);

    await notifyRepricedTotals(NOW);
    expect(vi.mocked(notifyCustomer).mock.calls[0]![0]).toMatchObject({
      userId: "u2",
      payload: { order_id: "o1", from_ghs: 500, to_ghs: 560, href: "/app/orders/o1" },
      whatsapp: { message: { params: ["Pixel 9", "500.00", "560.00"], buttonPath: "/app/orders/o1" } },
    });
  });
});
