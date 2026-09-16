import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/env", () => ({
  env: {
    app: { url: "https://tomame.test" },
    paystack: { secretKey: "sk_test", publicKey: "pk_test" },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

vi.mock("@/lib/paystack/client", () => ({
  initializeTransaction: vi.fn(),
  verifyTransaction: vi.fn(),
  generatePaymentReference: vi.fn(),
}));

vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn() }));

// The order and bag paths are not under test here, but `payments.service.ts`
// imports them at module scope.
vi.mock("@/features/orders/services/orders.service", () => ({
  getOrderById: vi.fn(),
  linkOrderToPayment: vi.fn(),
  sendOrderStatusEmail: vi.fn(),
}));
vi.mock("@/db/queries/order-groups", () => ({
  getOrderGroupById: vi.fn(),
  updateOrderGroupStatus: vi.fn(async () => true),
}));
vi.mock("@/db/queries/orders", () => ({ listOrdersByGroup: vi.fn(async () => []) }));
vi.mock("@/features/notifications/services/notifications.service", () => ({
  createOrderNotifications: vi.fn(),
}));

/**
 * `@/db/queries/car-orders` IS DELIBERATELY NOT MOCKED.
 *
 * It is the module that carries `.eq("status", "pending_payment")` — the
 * compare-and-set the entire car money path rests on — and mocking it would
 * replace the thing under test with a boolean somebody chose. It builds its own
 * client from `createAdminClient`, which is the fake above, so the real guarded
 * UPDATE runs against the real in-memory rows and a second settlement genuinely
 * matches nothing. Assertions about "exactly once" below are therefore
 * assertions about the SQL shape, not about call counts on a spy.
 */

import {
  initializePayment,
  handlePaymentCallback,
  handleWebhookEvent,
} from "@/features/payments/services/payments.service";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  initializeTransaction,
  verifyTransaction,
  generatePaymentReference,
} from "@/lib/paystack/client";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { sendOrderStatusEmail } from "@/features/orders/services/orders.service";
import { createOrderNotifications } from "@/features/notifications/services/notifications.service";
import { APIError } from "@/lib/auth/api-helpers";
import { findLiveCarOrderForListing } from "@/db/queries/car-orders";
import { createFakeClient, type FakeDb, type Row } from "./fake-supabase";
import type { PlatformUser } from "@/features/users/types";

// ── Fixtures ─────────────────────────────────────────────────────────────────

// Real v4 UUIDs: the request schema validates the RFC variant.
const USER_ID = "11111111-1111-4111-8111-111111111111";
const CAR_ORDER_ID = "55555555-5555-4555-8555-555555555555";
const CAR_LISTING_ID = "66666666-6666-4666-8666-666666666666";
const PAYMENT_ID = "77777777-7777-4777-8777-777777777777";
const REFERENCE = "TOM_1700000000000_abc123";

/** GH₵185,000 — a plausible landed Highlander, and the figure that was agreed. */
const AGREED_PESEWAS = 18_500_000;
/** 30% of it: GH₵55,500, the DEPOSIT, and what Paystack is actually asked for. */
const DEPOSIT_PESEWAS = 5_550_000;
/** GH₵129,500 left, settled offline and recorded by an admin (069). */
const BALANCE_PESEWAS = AGREED_PESEWAS - DEPOSIT_PESEWAS;
/** What an admin repriced the LISTING to afterwards. Must never be charged. */
const REPRICED_PESEWAS = 25_000_000;

let db: FakeDb;

function makeUser(overrides: Partial<PlatformUser> = {}): PlatformUser {
  return {
    id: USER_ID,
    email: "customer@example.com",
    profile: { id: USER_ID, role: "user", created_at: new Date(), updated_at: new Date() },
    ...overrides,
  } as unknown as PlatformUser;
}

function seedCarOrder(overrides: Partial<Row> = {}): Row {
  const row: Row = {
    id: CAR_ORDER_ID,
    car_listing_id: CAR_LISTING_ID,
    user_id: USER_ID,
    price_pesewas: AGREED_PESEWAS,
    price_state: "fixed",
    price_source: "listing",
    car_enquiry_id: null,
    car_label: "2019 Toyota Highlander XLE",
    deposit_pesewas: DEPOSIT_PESEWAS,
    deposit_percent: 30,
    balance_pesewas: BALANCE_PESEWAS,
    status: "pending_payment",
    payment_id: null,
    deposit_paid_at: null,
    paid_at: null,
    balance_amount_pesewas: null,
    balance_note: null,
    balance_recorded_by: null,
    cancelled_at: null,
    cancel_reason: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
  (db.car_orders ??= []).push(row);
  return row;
}

/**
 * The listing as it stands NOW — repriced since the order was placed.
 *
 * Seeded on purpose, at a different figure. Nothing in the payment path is
 * supposed to read it; if anything ever does, the amount assertions below come
 * back with GH₵250,000 and say so.
 */
function seedRepricedListing(): void {
  (db.car_listings ??= []).push({
    id: CAR_LISTING_ID,
    slug: "2019-toyota-highlander-xle",
    is_published: true,
    price_state: "fixed",
    price_pesewas: REPRICED_PESEWAS,
  });
}

/** A pending payment for the car order, as initialization would have left it. */
function seedCarPayment(overrides: Partial<Row> = {}): Row {
  const payment: Row = {
    id: PAYMENT_ID,
    user_id: USER_ID,
    reference: REFERENCE,
    amount: DEPOSIT_PESEWAS,
    currency: "GHS",
    status: "pending",
    channel: null,
    metadata: { car_order_id: CAR_ORDER_ID, car_listing_id: CAR_LISTING_ID },
    order_group_id: null,
    car_order_id: CAR_ORDER_ID,
    created_at: new Date().toISOString(),
    ...overrides,
  };
  db.payments.push(payment);
  return payment;
}

function verification(overrides: Record<string, unknown> = {}) {
  return {
    status: true,
    message: "Verification successful",
    data: {
      id: 99,
      status: "success",
      reference: REFERENCE,
      amount: DEPOSIT_PESEWAS,
      currency: "GHS",
      channel: "mobile_money",
      paid_at: "2026-09-15T10:00:00Z",
      customer: { email: "customer@example.com" },
      metadata: null,
      ...overrides,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db = { payments: [] };
  vi.mocked(createAdminClient).mockReturnValue(
    createFakeClient(db) as unknown as ReturnType<typeof createAdminClient>,
  );
  vi.mocked(generatePaymentReference).mockReturnValue(REFERENCE);
  vi.mocked(initializeTransaction).mockResolvedValue({
    status: true,
    message: "ok",
    data: {
      authorization_url: "https://checkout.paystack.com/car",
      access_code: "car",
      reference: REFERENCE,
    },
  });
  vi.mocked(verifyTransaction).mockResolvedValue(verification() as never);
});

async function expectApiError(promise: Promise<unknown>, statusCode: number) {
  await expect(promise).rejects.toBeInstanceOf(APIError);
  await promise.catch((err: APIError) => expect(err.statusCode).toBe(statusCode));
}

/** The one car order row. */
function carOrder(): Row {
  const row = db.car_orders?.at(0);
  if (!row) throw new Error("expected a car order row");
  return row;
}

function auditCalls(action: string) {
  return vi
    .mocked(logAuditEvent)
    .mock.calls.filter(([entry]) => entry.action === action);
}

// ── The charge ───────────────────────────────────────────────────────────────

describe("initializePayment — a car (068, deposit from 069)", () => {
  it("charges the DEPOSIT snapshotted on the car order, not the price and not the listing", async () => {
    seedCarOrder();
    // The admin has since raised the listing by GH₵65,000.
    seedRepricedListing();

    await initializePayment(makeUser(), { carOrderId: CAR_ORDER_ID });

    // GH₵55,500 — the deposit the customer was quoted. Charging the PRICE would
    // ask a MoMo wallet for GH₵185,000, which is the transaction 069 exists
    // because customers cannot complete; re-reading `car_listings` would ask for
    // GH₵250,000, a figure nobody ever saw.
    expect(vi.mocked(initializeTransaction).mock.calls[0]![0].amount).toBe(DEPOSIT_PESEWAS);
    expect(db.payments[0]!.amount).toBe(DEPOSIT_PESEWAS);
  });

  it("records the full price and the balance on the payment, so the deposit reads as one", async () => {
    seedCarOrder();

    await initializePayment(makeUser(), { carOrderId: CAR_ORDER_ID });

    expect(db.payments[0]!.metadata).toMatchObject({
      car_order_id: CAR_ORDER_ID,
      car_price_pesewas: AGREED_PESEWAS,
      car_balance_pesewas: BALANCE_PESEWAS,
    });
  });

  it("never recomputes the deposit — the row's figure is charged whatever the setting says", async () => {
    // An order written when the dial was at 20%. Nothing in the payment path
    // reads `car_deposit_percent` at all; this proves it by charging a deposit
    // that no current setting would produce.
    seedCarOrder({ deposit_pesewas: 3_700_000, deposit_percent: 20 });

    await initializePayment(makeUser(), { carOrderId: CAR_ORDER_ID });

    expect(vi.mocked(initializeTransaction).mock.calls[0]![0].amount).toBe(3_700_000);
  });

  it("refuses to charge a car whose deposit has already landed", async () => {
    // `deposit_paid`: the balance is settled offline and recorded by an admin,
    // so there is no second Paystack transaction to open — which is exactly why
    // `assertNoActivePayment` did not have to be relaxed for 069.
    seedCarOrder({
      status: "deposit_paid",
      payment_id: PAYMENT_ID,
      deposit_paid_at: new Date().toISOString(),
    });

    await expectApiError(initializePayment(makeUser(), { carOrderId: CAR_ORDER_ID }), 400);
    expect(initializeTransaction).not.toHaveBeenCalled();
  });

  it("refuses a car order whose deposit is somehow larger than its price", async () => {
    seedCarOrder({ deposit_pesewas: AGREED_PESEWAS + 1 });

    await expectApiError(initializePayment(makeUser(), { carOrderId: CAR_ORDER_ID }), 400);
    expect(initializeTransaction).not.toHaveBeenCalled();
  });

  it("stamps car_order_id on the payment row, which is what the guards scope on", async () => {
    seedCarOrder();

    await initializePayment(makeUser(), { carOrderId: CAR_ORDER_ID });

    expect(db.payments[0]!.car_order_id).toBe(CAR_ORDER_ID);
    expect(db.payments[0]!.order_group_id).toBeUndefined();
  });

  it("refuses a second checkout while a payment is already open for the car", async () => {
    seedCarOrder();
    await initializePayment(makeUser(), { carOrderId: CAR_ORDER_ID });
    vi.mocked(initializeTransaction).mockClear();

    // The customer double-tapped, or opened a second tab. One car, one charge.
    await expectApiError(initializePayment(makeUser(), { carOrderId: CAR_ORDER_ID }), 409);

    expect(initializeTransaction).not.toHaveBeenCalled();
    expect(db.payments).toHaveLength(1);
  });

  it("refuses a second checkout on a car that has already been paid for", async () => {
    seedCarOrder({
      status: "paid",
      payment_id: PAYMENT_ID,
      deposit_paid_at: new Date().toISOString(),
      paid_at: new Date().toISOString(),
    });

    await expectApiError(initializePayment(makeUser(), { carOrderId: CAR_ORDER_ID }), 400);
    expect(db.payments).toHaveLength(0);
  });

  it("refuses somebody else's car order indistinguishably from a missing one", async () => {
    seedCarOrder({ user_id: "99999999-9999-4999-8999-999999999999" });

    await expectApiError(initializePayment(makeUser(), { carOrderId: CAR_ORDER_ID }), 404);
    expect(initializeTransaction).not.toHaveBeenCalled();
  });

  it("refuses a car order carrying no price rather than charging zero", async () => {
    // Unreachable through the schema (the column is NOT NULL CHECK > 0); this is
    // the belt beside those braces, at the one line where money moves.
    seedCarOrder({ price_pesewas: 0 });

    await expectApiError(initializePayment(makeUser(), { carOrderId: CAR_ORDER_ID }), 400);
    expect(initializeTransaction).not.toHaveBeenCalled();
  });
});

// ── Settlement ───────────────────────────────────────────────────────────────

describe("handlePaymentCallback — a car settles once (068, deposit from 069)", () => {
  it("lands on deposit_paid — NOT paid — attributes the payment, and audits it", async () => {
    seedCarOrder();
    const payment = seedCarPayment();

    const { redirectUrl } = await handlePaymentCallback(REFERENCE);

    expect(payment.status).toBe("success");
    // THE CAR IS NOT PAID FOR. GH₵55,500 arrived against a GH₵185,000 vehicle;
    // writing `paid` here would tell the customer, the admin queue and every
    // later reader that the balance had been settled.
    expect(carOrder().status).toBe("deposit_paid");
    expect(carOrder().paid_at).toBeNull();
    // `car_orders_paid_is_attributed` requires both of these in the database.
    expect(carOrder().payment_id).toBe(PAYMENT_ID);
    expect(carOrder().deposit_paid_at).toEqual(expect.any(String));

    // The action does not say "paid" either — an audit trail is read by people.
    expect(auditCalls("car_order_paid")).toHaveLength(0);
    expect(auditCalls("car_order_deposit_paid")).toHaveLength(1);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "car_order_deposit_paid",
        entityType: "car_order",
        entityId: CAR_ORDER_ID,
        metadata: expect.objectContaining({
          to: "deposit_paid",
          amountPesewas: DEPOSIT_PESEWAS,
          pricePesewas: AGREED_PESEWAS,
          balancePesewas: BALANCE_PESEWAS,
        }),
      }),
    );

    expect(redirectUrl).toBe(
      `https://tomame.test/app/cars?payment=success&car=${CAR_ORDER_ID}`,
    );
  });

  it("goes straight to paid when the deposit WAS the whole price", async () => {
    // A 100% setting, or any order written before 069. Routing these through
    // `deposit_paid` would strand the car waiting for somebody to record a
    // balance of GH₵0 that nobody will ever record.
    seedCarOrder({ deposit_pesewas: AGREED_PESEWAS, deposit_percent: 100, balance_pesewas: 0 });
    seedCarPayment({ amount: AGREED_PESEWAS });
    vi.mocked(verifyTransaction).mockResolvedValue(
      verification({ amount: AGREED_PESEWAS }) as never,
    );

    await handlePaymentCallback(REFERENCE);

    expect(carOrder().status).toBe("paid");
    expect(carOrder().paid_at).toEqual(expect.any(String));
    expect(carOrder().deposit_paid_at).toEqual(expect.any(String));
    expect(auditCalls("car_order_paid")).toHaveLength(1);
    expect(auditCalls("car_order_deposit_paid")).toHaveLength(0);
  });

  it("keeps holding the car once the deposit is in", async () => {
    // `uq_car_orders_live` excludes only `cancelled`, so `deposit_paid` is still
    // in the live set and nobody else can buy this vehicle. This is the read
    // `claimCar` makes, carrying the same predicate as the index.
    seedCarOrder();
    seedCarPayment();

    await handlePaymentCallback(REFERENCE);

    const live = await findLiveCarOrderForListing(CAR_LISTING_ID);
    expect(live?.status).toBe("deposit_paid");
  });

  it("sends no parcel email and writes no parcel notification for a car", async () => {
    // `sendOrderStatusEmail` renders an Order — product name, origin country,
    // freight. A customer who has just bought a vehicle must not be mailed about
    // a shipment from the USA.
    seedCarOrder();
    seedCarPayment();

    await handlePaymentCallback(REFERENCE);

    expect(sendOrderStatusEmail).not.toHaveBeenCalled();
    expect(createOrderNotifications).not.toHaveBeenCalled();
  });

  it("does not repeat the effects when the callback is replayed", async () => {
    seedCarOrder();
    seedCarPayment();

    await handlePaymentCallback(REFERENCE);
    await handlePaymentCallback(REFERENCE);
    await handlePaymentCallback(REFERENCE);

    expect(auditCalls("car_order_deposit_paid")).toHaveLength(1);
    expect(auditCalls("payment_successful")).toHaveLength(1);
  });

  /**
   * Hold every delivery inside verification until `expected` of them have got
   * there, then release them together. Without this the two deliveries tend to
   * serialize by luck and the second short-circuits on an already-final payment,
   * so the test would pass with no guard in place at all.
   */
  function holdInVerification(expected: number, result = verification()) {
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    let arrived = 0;

    vi.mocked(verifyTransaction).mockImplementation(async () => {
      arrived += 1;
      if (arrived === expected) release();
      await barrier;
      return result as never;
    });
  }

  it("settles the car exactly once when the callback and the webhook race", async () => {
    seedCarOrder();
    seedCarPayment();
    holdInVerification(2);

    // Both deliveries read a PENDING payment and both verify successfully. Only
    // one may get past `transitionPaymentStatus`.
    await Promise.all([handlePaymentCallback(REFERENCE), handleWebhookEvent({
      event: "charge.success",
      data: { reference: REFERENCE, status: "success" },
    })]);

    expect(verifyTransaction).toHaveBeenCalledTimes(2);
    expect(carOrder().status).toBe("deposit_paid");
    expect(auditCalls("car_order_deposit_paid")).toHaveLength(1);
    expect(auditCalls("payment_successful")).toHaveLength(1);
  });

  it("flips the car order only once even if a second settlement gets past the payment guard", async () => {
    // The payment guard is one of two locks; this exercises the OTHER one on its
    // own, by putting the payment back to pending after it settled — which is
    // what a rerun of the reconciliation sweep against a half-finished
    // settlement would look like. `updateCarOrderStatus` carries
    // `.eq("status", "pending_payment")`, so the second pass matches no row.
    seedCarOrder();
    const payment = seedCarPayment();

    await handlePaymentCallback(REFERENCE);
    const firstDepositPaidAt = carOrder().deposit_paid_at;

    payment.status = "pending";
    await handlePaymentCallback(REFERENCE);

    expect(carOrder().status).toBe("deposit_paid");
    // Untouched: the second update matched nothing at all, rather than
    // re-stamping the moment the customer paid.
    expect(carOrder().deposit_paid_at).toBe(firstDepositPaidAt);
    expect(auditCalls("car_order_deposit_paid")).toHaveLength(1);
  });

  it("raises a refund review when money lands on a car order that was cancelled", async () => {
    // The checkout was abandoned, the sweep released the car, and then the
    // customer paid the old Paystack link anyway. Nothing settles; a person has
    // to decide between a refund and a reinstatement, and cannot if this is
    // silent.
    seedCarOrder({ status: "cancelled", cancelled_at: new Date().toISOString() });
    const payment = seedCarPayment();

    await handlePaymentCallback(REFERENCE);

    expect(payment.status).toBe("success");
    expect(carOrder().status).toBe("cancelled");
    expect(auditCalls("car_order_paid")).toHaveLength(0);
    expect(auditCalls("car_order_deposit_paid")).toHaveLength(0);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "payment_successful",
        metadata: expect.objectContaining({ needsRefundReview: true }),
      }),
    );
  });

  it("does not report a car as sold when the database write fails", async () => {
    // A failed write must never be mistaken for "the other delivery already
    // handled it" — that would show the customer a success page over a car order
    // that stayed pending.
    seedCarOrder();
    seedCarPayment();
    db.failWrites = true;

    await expectApiError(handlePaymentCallback(REFERENCE), 502);

    expect(carOrder().status).toBe("pending_payment");
    expect(auditCalls("car_order_paid")).toHaveLength(0);
    expect(auditCalls("car_order_deposit_paid")).toHaveLength(0);
  });

  // `/app/cars` — `src/app/app/cars/page.tsx`, a real route — and NOT the
  // vehicle's own `/app/cars/[slug]` page, which is keyed by a slug this path
  // does not hold and `notFound()`s the moment an admin unpublishes the car
  // they have just sold. `successUrl` carries the long argument.
  it("lands a failed car charge on a route that exists", async () => {
    seedCarOrder();
    seedCarPayment();
    vi.mocked(verifyTransaction).mockResolvedValue(verification({ status: "failed" }) as never);

    const { redirectUrl } = await handlePaymentCallback(REFERENCE);

    expect(redirectUrl).toBe(`https://tomame.test/app/cars?payment=failed&car=${CAR_ORDER_ID}`);
    expect(carOrder().status).toBe("pending_payment");
  });

  it("refuses to settle a car when Paystack reports a different amount", async () => {
    seedCarOrder();
    const payment = seedCarPayment();
    // The deposit underpaid by GH₵1,000. The verification is the evidence, not
    // the webhook — and what it is compared against is the DEPOSIT this payment
    // was opened for, which is the only amount Paystack was ever asked for.
    vi.mocked(verifyTransaction).mockResolvedValue(
      verification({ amount: DEPOSIT_PESEWAS - 100_000 }) as never,
    );

    await handlePaymentCallback(REFERENCE);

    expect(payment.status).toBe("failed");
    expect(carOrder().status).toBe("pending_payment");
    expect(auditCalls("car_order_deposit_paid")).toHaveLength(0);
  });
});
