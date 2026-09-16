import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn() }));

vi.mock("@/db/queries/cars", () => ({ getCarListingById: vi.fn() }));

/**
 * The query layer IS mocked here, unlike in `car-payments.service.test.ts`.
 *
 * What is under test in this file is the decision — which cars may be bought,
 * whose order is whose, and where the price comes from — not the SQL. The one
 * thing that cannot be exercised against an in-memory fake is
 * `uq_car_orders_live` refusing a concurrent insert, because a fake has no
 * unique indexes; so `CarAlreadySoldError` is raised directly, which is exactly
 * the value `db/queries/car-orders.ts` translates a 23505 into. The guarded
 * UPDATE itself is tested for real, against real rows, in the payments suite.
 */
vi.mock("@/db/queries/car-orders", () => {
  // The error class is REDEFINED rather than imported through `importActual`:
  // the real module builds a service-role Supabase client at import time, which
  // needs env this suite deliberately does not have. The service and this test
  // both take the class from here, so `instanceof` still means what it says.
  class CarAlreadySoldError extends Error {
    constructor() {
      super("This car already has a live order");
      this.name = "CarAlreadySoldError";
    }
  }
  return {
    CarAlreadySoldError,
    findLiveCarOrderForListing: vi.fn(),
    insertCarOrder: vi.fn(),
    getCarOrderById: vi.fn(),
    updateCarOrderStatus: vi.fn(),
    listCarOrdersForUser: vi.fn(),
  };
});

vi.mock("@/features/payments/services/payments.service", () => ({
  initializePayment: vi.fn(),
}));

import { startCarCheckout, cancelCarOrder } from "@/features/cars/services/car-orders.service";
import { getCarListingById } from "@/db/queries/cars";
import {
  CarAlreadySoldError,
  findLiveCarOrderForListing,
  getCarOrderById,
  insertCarOrder,
  updateCarOrderStatus,
} from "@/db/queries/car-orders";
import { initializePayment } from "@/features/payments/services/payments.service";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { APIError } from "@/lib/auth/api-helpers";
import type { CarListingRow } from "@/features/cars/types";
import type { CarOrderRow } from "@/features/cars/car-orders.types";
import type { PlatformUser } from "@/features/users/types";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "99999999-9999-4999-8999-999999999999";
const CAR_LISTING_ID = "66666666-6666-4666-8666-666666666666";
const CAR_ORDER_ID = "55555555-5555-4555-8555-555555555555";

/** GH₵185,000 landed. */
const LISTING_PESEWAS = 18_500_000;

function makeUser(id = USER_ID): PlatformUser {
  return {
    id,
    email: "customer@example.com",
    profile: { id, role: "user", created_at: new Date(), updated_at: new Date() },
  } as unknown as PlatformUser;
}

function makeListing(overrides: Partial<CarListingRow> = {}): CarListingRow {
  return {
    id: CAR_LISTING_ID,
    slug: "2019-toyota-highlander-xle",
    make: "Toyota",
    model: "Highlander",
    trim: "XLE",
    year: 2019,
    mileage: 82_000,
    mileage_unit: "mi",
    body_type: "suv",
    fuel: "petrol",
    transmission: "automatic",
    drivetrain: "awd",
    exterior_colour: "Silver",
    vin: null,
    origin_country: "USA",
    vessel_name: "MV Grande Lagos",
    sailed_on: "2026-08-01",
    eta_tema: "2026-09-20",
    description: "",
    price_state: "fixed",
    price_pesewas: LISTING_PESEWAS,
    vehicle_price_pesewas: null,
    freight_insurance_pesewas: null,
    duty_clearing_pesewas: null,
    service_fee_pesewas: null,
    is_published: true,
    sort_order: 0,
    created_by: null,
    updated_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as CarListingRow;
}

function makeCarOrder(overrides: Partial<CarOrderRow> = {}): CarOrderRow {
  return {
    id: CAR_ORDER_ID,
    car_listing_id: CAR_LISTING_ID,
    user_id: USER_ID,
    price_pesewas: LISTING_PESEWAS,
    price_state: "fixed",
    car_label: "2019 Toyota Highlander XLE",
    status: "pending_payment",
    payment_id: null,
    paid_at: null,
    cancelled_at: null,
    cancel_reason: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCarListingById).mockResolvedValue(makeListing());
  vi.mocked(findLiveCarOrderForListing).mockResolvedValue(null);
  vi.mocked(insertCarOrder).mockImplementation(async (input) =>
    makeCarOrder({
      car_listing_id: input.car_listing_id,
      user_id: input.user_id,
      price_pesewas: input.price_pesewas,
      price_state: input.price_state,
      car_label: input.car_label,
    }),
  );
  vi.mocked(initializePayment).mockResolvedValue({
    authorizationUrl: "https://checkout.paystack.com/car",
    payment: {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      reference: "TOM_1700000000000_abc123",
      amount: LISTING_PESEWAS,
      currency: "GHS",
      status: "pending",
      channel: null,
      createdAt: new Date().toISOString(),
    },
  });
});

async function expectApiError(promise: Promise<unknown>, statusCode: number) {
  await expect(promise).rejects.toBeInstanceOf(APIError);
  await promise.catch((err: APIError) => expect(err.statusCode).toBe(statusCode));
}

// ── The price never comes from the client ────────────────────────────────────

describe("startCarCheckout — the price is the server's (R: never trust the client)", () => {
  it("snapshots the listing's price onto the car order", async () => {
    const result = await startCarCheckout(makeUser(), { carListingId: CAR_LISTING_ID });

    expect(insertCarOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        car_listing_id: CAR_LISTING_ID,
        user_id: USER_ID,
        price_pesewas: LISTING_PESEWAS,
        price_state: "fixed",
        car_label: "2019 Toyota Highlander XLE",
      }),
    );
    expect(result.authorizationUrl).toBe("https://checkout.paystack.com/car");
    expect(result.reference).toBe("TOM_1700000000000_abc123");
  });

  it("hands the payment path an id and nothing else — no amount travels with it", async () => {
    await startCarCheckout(makeUser(), { carListingId: CAR_LISTING_ID });

    // The charge reads `car_orders.price_pesewas` for itself. If an amount ever
    // appears in this call, a caller one refactor away can name their own price.
    expect(initializePayment).toHaveBeenCalledWith(
      expect.anything(),
      { carOrderId: CAR_ORDER_ID },
    );
  });

  it("charges the price that was on the listing when the customer pressed Buy", async () => {
    // The admin raises the listing between the read and the insert. Whatever the
    // service snapshotted is what the customer owes — never a figure read later.
    vi.mocked(getCarListingById).mockResolvedValue(makeListing({ price_pesewas: 20_000_000 }));

    await startCarCheckout(makeUser(), { carListingId: CAR_LISTING_ID });

    expect(vi.mocked(insertCarOrder).mock.calls[0]![0].price_pesewas).toBe(20_000_000);
  });

  it("audits the sale with both the snapshot and the listing's figure", async () => {
    await startCarCheckout(makeUser(), { carListingId: CAR_LISTING_ID });

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "car_order_created",
        entityType: "car_order",
        entityId: CAR_ORDER_ID,
        actorId: USER_ID,
        metadata: expect.objectContaining({
          carListingId: CAR_LISTING_ID,
          pricePesewas: LISTING_PESEWAS,
          listingPricePesewas: LISTING_PESEWAS,
        }),
      }),
    );
  });
});

// ── What cannot be bought ────────────────────────────────────────────────────

describe("startCarCheckout — what is not purchasable", () => {
  it("refuses a price-on-request car rather than charging zero", async () => {
    // 067's `car_listings_price_state_has_price` guarantees this listing has NO
    // price. Buying it could only mean charging nothing, or a number nobody
    // quoted.
    vi.mocked(getCarListingById).mockResolvedValue(
      makeListing({ price_state: "on_request", price_pesewas: null }),
    );

    await expectApiError(startCarCheckout(makeUser(), { carListingId: CAR_LISTING_ID }), 409);

    expect(insertCarOrder).not.toHaveBeenCalled();
    expect(initializePayment).not.toHaveBeenCalled();
  });

  it("refuses an unpublished draft", async () => {
    vi.mocked(getCarListingById).mockResolvedValue(makeListing({ is_published: false }));

    await expectApiError(startCarCheckout(makeUser(), { carListingId: CAR_LISTING_ID }), 409);
    expect(insertCarOrder).not.toHaveBeenCalled();
  });

  it("refuses a listing that says it is priced but carries no figure", async () => {
    // Unreachable while the CHECK holds. The alternative to refusing here is a
    // charge of zero pesewas.
    vi.mocked(getCarListingById).mockResolvedValue(
      makeListing({ price_state: "fixed", price_pesewas: null }),
    );

    await expectApiError(startCarCheckout(makeUser(), { carListingId: CAR_LISTING_ID }), 409);
    expect(insertCarOrder).not.toHaveBeenCalled();
  });

  it("404s a car that does not exist", async () => {
    vi.mocked(getCarListingById).mockResolvedValue(null);
    await expectApiError(startCarCheckout(makeUser(), { carListingId: CAR_LISTING_ID }), 404);
  });

  it("a negotiable listing may be bought at the asking price", async () => {
    vi.mocked(getCarListingById).mockResolvedValue(makeListing({ price_state: "negotiable" }));

    await startCarCheckout(makeUser(), { carListingId: CAR_LISTING_ID });

    expect(vi.mocked(insertCarOrder).mock.calls[0]![0].price_state).toBe("negotiable");
  });
});

// ── One car, one buyer ───────────────────────────────────────────────────────

describe("startCarCheckout — a car may only be sold once", () => {
  it("refuses a car somebody else is already buying", async () => {
    vi.mocked(findLiveCarOrderForListing).mockResolvedValue(
      makeCarOrder({ user_id: OTHER_USER_ID }),
    );

    await expectApiError(startCarCheckout(makeUser(), { carListingId: CAR_LISTING_ID }), 409);

    expect(insertCarOrder).not.toHaveBeenCalled();
    expect(initializePayment).not.toHaveBeenCalled();
  });

  it("refuses a car somebody else has already paid for", async () => {
    vi.mocked(findLiveCarOrderForListing).mockResolvedValue(
      makeCarOrder({ user_id: OTHER_USER_ID, status: "in_transit" }),
    );

    await expectApiError(startCarCheckout(makeUser(), { carListingId: CAR_LISTING_ID }), 409);
  });

  it("refuses a car this customer has already paid for", async () => {
    vi.mocked(findLiveCarOrderForListing).mockResolvedValue(makeCarOrder({ status: "paid" }));

    await expectApiError(startCarCheckout(makeUser(), { carListingId: CAR_LISTING_ID }), 409);
    expect(initializePayment).not.toHaveBeenCalled();
  });

  it("turns the unique index's refusal into a 409 rather than a 500", async () => {
    // The race the read above cannot win: another customer's insert landed
    // between our SELECT and ours, and `uq_car_orders_live` refused the second
    // row. The database settled it; this is how that reaches a customer.
    vi.mocked(findLiveCarOrderForListing).mockResolvedValue(null);
    vi.mocked(insertCarOrder).mockRejectedValue(new CarAlreadySoldError());

    await expectApiError(startCarCheckout(makeUser(), { carListingId: CAR_LISTING_ID }), 409);
    expect(initializePayment).not.toHaveBeenCalled();
  });

  it("lets the same customer retry their own unfinished purchase", async () => {
    // Their card was declined. `uq_car_orders_live` covers every state but
    // `cancelled`, so a fresh insert is impossible — without reuse the index
    // that protects them from a double charge would lock them out of the car.
    const mine = makeCarOrder();
    vi.mocked(findLiveCarOrderForListing).mockResolvedValue(mine);

    const result = await startCarCheckout(makeUser(), { carListingId: CAR_LISTING_ID });

    expect(insertCarOrder).not.toHaveBeenCalled();
    // No second `car_order_created` row: nothing was created.
    expect(logAuditEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "car_order_created" }),
    );
    expect(initializePayment).toHaveBeenCalledWith(expect.anything(), {
      carOrderId: mine.id,
    });
    expect(result.reference).toBe("TOM_1700000000000_abc123");
  });

  it("does not create the order when the payment provider refuses the charge", async () => {
    // The row is written first on purpose — the reservation must exist before
    // money can move — but a 409 from the double-payment guard must surface, not
    // be swallowed into a success.
    vi.mocked(initializePayment).mockRejectedValue(
      new APIError(409, "A payment is already in progress for this car."),
    );

    await expectApiError(startCarCheckout(makeUser(), { carListingId: CAR_LISTING_ID }), 409);
  });
});

// ── Releasing a car ──────────────────────────────────────────────────────────

describe("cancelCarOrder — the release valve", () => {
  it("cancels an unpaid order and audits it", async () => {
    vi.mocked(getCarOrderById).mockResolvedValue(makeCarOrder());
    vi.mocked(updateCarOrderStatus).mockResolvedValue(true);

    const cancelled = await cancelCarOrder(
      { id: null, role: "system" },
      CAR_ORDER_ID,
      "payment abandoned",
    );

    expect(cancelled).toBe(true);
    expect(updateCarOrderStatus).toHaveBeenCalledWith(
      CAR_ORDER_ID,
      "pending_payment",
      "cancelled",
      expect.objectContaining({ cancel_reason: "payment abandoned" }),
    );
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "car_order_cancelled", entityType: "car_order" }),
    );
  });

  it("refuses to cancel a car that has been paid for — that is a refund", async () => {
    vi.mocked(getCarOrderById).mockResolvedValue(makeCarOrder({ status: "paid" }));

    await expectApiError(
      cancelCarOrder({ id: USER_ID, role: "admin" }, CAR_ORDER_ID, "changed their mind"),
      400,
    );
    expect(updateCarOrderStatus).not.toHaveBeenCalled();
  });

  it("writes no audit row when it lost the race to cancel", async () => {
    vi.mocked(getCarOrderById).mockResolvedValue(makeCarOrder());
    vi.mocked(updateCarOrderStatus).mockResolvedValue(false);

    expect(await cancelCarOrder({ id: null, role: "system" }, CAR_ORDER_ID, "swept")).toBe(false);
    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});
