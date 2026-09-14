import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { app: { url: "http://localhost:3000" } } }));
vi.mock("@/lib/email/transport", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/email/templates/order-status", () => ({
  orderPlacedTemplate: vi.fn(),
  orderPaidTemplate: vi.fn(),
  orderProcessingTemplate: vi.fn(),
  orderShippedTemplate: vi.fn(),
  orderDeliveredTemplate: vi.fn(),
  orderCancelledTemplate: vi.fn(),
}));
vi.mock("@/lib/email/notify-preference", () => ({ mayEmailUser: vi.fn(async () => true) }));
vi.mock("@/lib/auth/admin-access", () => ({ canAccessAdmin: vi.fn(() => false) }));
vi.mock("@/lib/supabase/errors", () => ({ isSchemaMissingError: () => false }));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn() }));
vi.mock("../order-intake.service", () => ({ buildOrderIntake: vi.fn() }));
vi.mock("../order-transitions", () => ({ allowedTransitionsFrom: vi.fn(() => []) }));
vi.mock("../order-events.service", () => ({ eventForStatus: vi.fn(() => null), recordOrderEvent: vi.fn() }));
vi.mock("@/features/quotes/services/quote-lock.service", () => ({ consumeQuoteLocksForOrder: vi.fn() }));

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "u1";
const OTHER_USER_ID = "u2";

interface FakeLog {
  id: string;
  actor_id: string | null;
  actor_role: "user" | "admin" | "system";
  action: string;
  entity_type: "order";
  entity_id: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

let logsToReturn: FakeLog[] = [];
let orderRow: Record<string, unknown> | null = null;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "orders") {
        return {
          select: () => ({
            eq: () => ({
              single: async () =>
                orderRow ? { data: orderRow, error: null } : { data: null, error: { message: "no rows" } },
            }),
          }),
        };
      }
      // audit_logs
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: async () => ({ data: logsToReturn, error: null }),
            }),
          }),
        }),
      };
    },
  }),
}));

import { canAccessAdmin } from "@/lib/auth/admin-access";
import { getOrderAuditHistory } from "../orders.service";

const log = (over: Partial<FakeLog> = {}): FakeLog => ({
  id: "log-1",
  actor_id: "admin-9",
  actor_role: "admin",
  action: "order_status_changed",
  entity_type: "order",
  entity_id: ORDER_ID,
  metadata: { from: "paid", to: "processing" },
  created_at: "2026-09-14T10:00:00Z",
  ...over,
});

const customer = { id: OWNER_ID, profile: { id: OWNER_ID, role: "user" } } as never;
const otherUser = { id: OTHER_USER_ID, profile: { id: OTHER_USER_ID, role: "user" } } as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(canAccessAdmin).mockReturnValue(false);
  orderRow = { id: ORDER_ID, user_id: OWNER_ID, status: "processing" };
  logsToReturn = [];
});

describe("getOrderAuditHistory: ownership", () => {
  it("404s when the order does not exist", async () => {
    orderRow = null;
    await expect(getOrderAuditHistory(customer, ORDER_ID)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("404s a viewer who does not own the order and is not an admin", async () => {
    await expect(getOrderAuditHistory(otherUser, ORDER_ID)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("lets the owner read their own order's history", async () => {
    logsToReturn = [log()];
    await expect(getOrderAuditHistory(customer, ORDER_ID)).resolves.toHaveLength(1);
  });

  it("lets an admin read a customer's order history", async () => {
    vi.mocked(canAccessAdmin).mockReturnValue(true);
    logsToReturn = [log()];
    await expect(getOrderAuditHistory(otherUser, ORDER_ID)).resolves.toHaveLength(1);
  });
});

describe("getOrderAuditHistory: customer-safe shape", () => {
  it("never emits an actor id, a row id, or an entity id", async () => {
    logsToReturn = [log({ id: "internal-log-id", actor_id: "admin-super-secret-id" })];
    const [entry] = await getOrderAuditHistory(customer, ORDER_ID);
    const keys = Object.keys(entry as object);
    expect(keys).toEqual(["action", "actor", "created_at", "metadata"]);
    expect(JSON.stringify(entry)).not.toContain("admin-super-secret-id");
    expect(JSON.stringify(entry)).not.toContain("internal-log-id");
  });

  it("labels a 'user' actor as 'you', never the customer's real id", async () => {
    logsToReturn = [log({ action: "order_created", actor_role: "user", actor_id: OWNER_ID, metadata: null })];
    const [entry] = await getOrderAuditHistory(customer, ORDER_ID);
    expect(entry?.actor).toBe("you");
  });

  it("labels an 'admin' actor as 'our team'", async () => {
    logsToReturn = [log({ actor_role: "admin" })];
    const [entry] = await getOrderAuditHistory(customer, ORDER_ID);
    expect(entry?.actor).toBe("our team");
  });

  it("labels a 'system' actor as 'our team', not 'system' internals", async () => {
    logsToReturn = [log({ actor_role: "system", action: "order_expired_unpaid", metadata: { from: "pending", to: "cancelled", ttlHours: 24 } })];
    const [entry] = await getOrderAuditHistory(customer, ORDER_ID);
    expect(entry?.actor).toBe("our team");
  });

  it("passes through the {from, to} status pair on order_status_changed", async () => {
    logsToReturn = [log({ metadata: { from: "paid", to: "processing" } })];
    const [entry] = await getOrderAuditHistory(customer, ORDER_ID);
    expect(entry?.metadata).toEqual({ from: "paid", to: "processing" });
  });

  it("drops paymentId and orderGroupId off a payment-driven order_status_changed row", async () => {
    logsToReturn = [
      log({
        actor_role: "system",
        metadata: { from: "pending", to: "paid", paymentId: "pay_123", orderGroupId: "grp_456" },
      }),
    ];
    const [entry] = await getOrderAuditHistory(customer, ORDER_ID);
    expect(entry?.metadata).toEqual({ from: "pending", to: "paid" });
  });

  it("keeps admin_total_ghs but drops the internal admin_pricing_note on order_price_set", async () => {
    logsToReturn = [
      log({
        action: "order_price_set",
        metadata: {
          admin_total_ghs: 450.5,
          admin_pricing_note: "Customer asked for expedited handling, charged extra",
          previousReviewReasons: ["weight_mismatch"],
        },
      }),
    ];
    const [entry] = await getOrderAuditHistory(customer, ORDER_ID);
    expect(entry?.metadata).toEqual({ admin_total_ghs: 450.5 });
    expect(JSON.stringify(entry)).not.toContain("expedited handling");
  });

  it("emits no metadata at all for a rejection — the internal reason never reaches the customer", async () => {
    logsToReturn = [
      log({
        action: "order_review_rejected",
        metadata: { reason: "Item is counterfeit per seller listing", previousReviewReasons: [] },
      }),
    ];
    const [entry] = await getOrderAuditHistory(customer, ORDER_ID);
    expect(entry?.metadata).toBeNull();
    expect(JSON.stringify(entry)).not.toContain("counterfeit");
  });

  it("emits no metadata for order_created even though the raw row carries pricing and cache internals", async () => {
    logsToReturn = [
      log({
        action: "order_created",
        actor_role: "user",
        metadata: {
          product_url: "https://example.com/p/1",
          extraction_cache_id: "cache-1",
          rate_lock_id: "lock-1",
          total_ghs: 300,
        },
      }),
    ];
    const [entry] = await getOrderAuditHistory(customer, ORDER_ID);
    expect(entry?.metadata).toBeNull();
  });

  it("keeps the delivery window on order_eta_window_set but drops the prior window", async () => {
    logsToReturn = [
      log({
        action: "order_eta_window_set",
        metadata: {
          from: { eta_from: "2026-09-10", eta_to: "2026-09-12" },
          to: { eta_from: "2026-09-20", eta_to: "2026-09-22" },
          estimated_delivery_date: "2026-09-21",
        },
      }),
    ];
    const [entry] = await getOrderAuditHistory(customer, ORDER_ID);
    expect(entry?.metadata).toEqual({
      to: { eta_from: "2026-09-20", eta_to: "2026-09-22" },
      estimated_delivery_date: "2026-09-21",
    });
  });

  it("keeps priceChanged/countryChanged on an approval but drops previousReviewReasons", async () => {
    logsToReturn = [
      log({
        action: "order_review_approved",
        metadata: { priceChanged: true, countryChanged: false, previousReviewReasons: ["needs_review"], updates: { qty: 2 } },
      }),
    ];
    const [entry] = await getOrderAuditHistory(customer, ORDER_ID);
    expect(entry?.metadata).toEqual({ priceChanged: true, countryChanged: false });
  });

  it("drops metadata entirely for an unrecognized future action rather than passing it through", async () => {
    logsToReturn = [log({ action: "some_future_admin_action", metadata: { secret_note: "do not show" } })];
    const [entry] = await getOrderAuditHistory(customer, ORDER_ID);
    expect(entry?.metadata).toBeNull();
  });
});
