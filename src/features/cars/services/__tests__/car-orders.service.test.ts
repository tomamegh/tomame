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
    listAgreedCarEnquiriesForUser: vi.fn(),
  };
});

// The deposit percentage (069) is an admin setting; the default it falls back to
// is exercised on its own below.
vi.mock("@/db/queries/site-settings", () => ({ getSiteSettingsMap: vi.fn() }));

vi.mock("@/features/payments/services/payments.service", () => ({
  initializePayment: vi.fn(),
}));

import {
  startCarCheckout,
  cancelCarOrder,
  getCarPurchaseTerms,
  recordCarBalancePayment,
  releaseCarOrder,
} from "@/features/cars/services/car-orders.service";
import { getCarListingById } from "@/db/queries/cars";
import {
  CarAlreadySoldError,
  findLiveCarOrderForListing,
  getCarOrderById,
  insertCarOrder,
  listAgreedCarEnquiriesForUser,
  updateCarOrderStatus,
} from "@/db/queries/car-orders";
import { getSiteSettingsMap } from "@/db/queries/site-settings";
import { initializePayment } from "@/features/payments/services/payments.service";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { APIError } from "@/lib/auth/api-helpers";
import type { CarEnquiryRow, CarListingRow } from "@/features/cars/types";
import type { CarOrderRow } from "@/features/cars/car-orders.types";
import type { PlatformUser } from "@/features/users/types";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "99999999-9999-4999-8999-999999999999";
const CAR_LISTING_ID = "66666666-6666-4666-8666-666666666666";
const CAR_ORDER_ID = "55555555-5555-4555-8555-555555555555";

/** GH₵185,000 landed — the public asking price. */
const LISTING_PESEWAS = 18_500_000;
/** GH₵120,000 — what an admin quoted ONE customer on an `on_request` car. */
const QUOTED_PESEWAS = 12_000_000;
/** GH₵164,500 — an offer we accepted on a GH₵185,000 car. */
const ACCEPTED_OFFER_PESEWAS = 16_450_000;
const ENQUIRY_ID = "33333333-3333-4333-8333-333333333333";
/** 30% of GH₵185,000, in whole pesewas. The default deposit. */
const LISTING_DEPOSIT_PESEWAS = 5_550_000;

function makeUser(id = USER_ID): PlatformUser {
  return {
    id,
    email: "customer@example.com",
    profile: { id, role: "user", first_name: "Kwame", last_name: "Mensah", phone: "024 555 0192", created_at: new Date(), updated_at: new Date() },
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
    price_source: "listing",
    car_enquiry_id: null,
    car_label: "2019 Toyota Highlander XLE",
    deposit_pesewas: LISTING_DEPOSIT_PESEWAS,
    deposit_percent: 30,
    balance_pesewas: LISTING_PESEWAS - LISTING_DEPOSIT_PESEWAS,
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
}

/** An enquiry row as `listAgreedCarEnquiriesForUser` returns them. */
function makeEnquiry(overrides: Partial<CarEnquiryRow> = {}): CarEnquiryRow {
  return {
    id: ENQUIRY_ID,
    car_listing_id: CAR_LISTING_ID,
    user_id: USER_ID,
    kind: "price_request",
    offer_pesewas: null,
    message: null,
    status: "answered",
    admin_response: null,
    quoted_pesewas: QUOTED_PESEWAS,
    answered_by: null,
    answered_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/** The `on_request` Mercedes that was quoted to one customer and nobody else. */
function quotedListing(): CarListingRow {
  return makeListing({ price_state: "on_request", price_pesewas: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCarListingById).mockResolvedValue(makeListing());
  vi.mocked(findLiveCarOrderForListing).mockResolvedValue(null);
  vi.mocked(listAgreedCarEnquiriesForUser).mockResolvedValue([]);
  // Seeded by 069 at 30. Read through the same cookieless map
  // `payment_expiry_minutes` is read on.
  vi.mocked(getSiteSettingsMap).mockResolvedValue({ car_deposit_percent: 30 });
  vi.mocked(insertCarOrder).mockImplementation(async (input) =>
    makeCarOrder({
      car_listing_id: input.car_listing_id,
      user_id: input.user_id,
      price_pesewas: input.price_pesewas,
      price_state: input.price_state,
      price_source: input.price_source,
      car_enquiry_id: input.car_enquiry_id,
      car_label: input.car_label,
      deposit_pesewas: input.deposit_pesewas,
      deposit_percent: input.deposit_percent,
      balance_pesewas: input.price_pesewas - input.deposit_pesewas,
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
  it("refuses a price-on-request car NOBODY HAS QUOTED rather than charging zero", async () => {
    // 067's `car_listings_price_state_has_price` guarantees this listing has NO
    // price. With no quote to this customer, buying it could only mean charging
    // nothing, or a number nobody named. (A customer who HAS been quoted may buy
    // it — see the agreed-price suite below, which is the 069 fix.)
    vi.mocked(getCarListingById).mockResolvedValue(quotedListing());

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

// ── The agreed price is that customer's price (069) ──────────────────────────

describe("startCarCheckout — the customer's own agreed figure", () => {
  it("lets a customer buy an on_request car AT THE FIGURE THEY WERE QUOTED", async () => {
    // THE LIVE PRODUCTION DEFECT. A Mercedes E300 quoted at GH₵120,000 could not
    // be bought at all: the listing carries no public price, so every purchase
    // check refused it and the customer had no way to pay a figure a person had
    // already given them.
    vi.mocked(getCarListingById).mockResolvedValue(quotedListing());
    vi.mocked(listAgreedCarEnquiriesForUser).mockResolvedValue([makeEnquiry()]);

    await startCarCheckout(makeUser(), { carListingId: CAR_LISTING_ID });

    expect(insertCarOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        price_pesewas: QUOTED_PESEWAS,
        price_source: "quote",
        car_enquiry_id: ENQUIRY_ID,
        // 069 widened the CHECK to admit this, guarded by
        // `car_orders_on_request_is_quoted`: the state is only ever reachable
        // with a price_source other than `listing`.
        price_state: "on_request",
      }),
    );
  });

  it("charges the ACCEPTED OFFER, not the asking price", async () => {
    // The overcharge 069 fixes: accepting GH₵164,500 on a GH₵185,000 car and
    // then charging GH₵185,000 takes GH₵20,500 the customer never agreed to.
    vi.mocked(listAgreedCarEnquiriesForUser).mockResolvedValue([
      makeEnquiry({
        kind: "offer",
        status: "accepted",
        offer_pesewas: ACCEPTED_OFFER_PESEWAS,
        // We countered at the asking price before accepting. `quoted_pesewas` is
        // what WE said; the accepted figure is what THEY said, and that is the
        // one that binds.
        quoted_pesewas: LISTING_PESEWAS,
      }),
    ]);

    await startCarCheckout(makeUser(), { carListingId: CAR_LISTING_ID });

    const insert = vi.mocked(insertCarOrder).mock.calls[0]![0];
    expect(insert.price_pesewas).toBe(ACCEPTED_OFFER_PESEWAS);
    expect(insert.price_source).toBe("accepted_offer");
    expect(insert.car_enquiry_id).toBe(ENQUIRY_ID);
  });

  it("cannot be reached with somebody else's quote", async () => {
    // The read filters `user_id` in SQL, which is the guard that matters; this
    // proves the SERVICE asks for its own customer and refuses a row that is not
    // theirs even if one somehow came back.
    vi.mocked(getCarListingById).mockResolvedValue(quotedListing());
    vi.mocked(listAgreedCarEnquiriesForUser).mockResolvedValue([
      makeEnquiry({ user_id: OTHER_USER_ID }),
    ]);

    await expectApiError(startCarCheckout(makeUser(), { carListingId: CAR_LISTING_ID }), 409);

    // Asked for THIS customer's enquiries and nobody else's.
    expect(listAgreedCarEnquiriesForUser).toHaveBeenCalledWith(CAR_LISTING_ID, USER_ID);
    expect(insertCarOrder).not.toHaveBeenCalled();
  });

  it("ignores an enquiry for a different car", async () => {
    vi.mocked(getCarListingById).mockResolvedValue(quotedListing());
    vi.mocked(listAgreedCarEnquiriesForUser).mockResolvedValue([
      makeEnquiry({ car_listing_id: "77777777-7777-4777-8777-777777777777" }),
    ]);

    await expectApiError(startCarCheckout(makeUser(), { carListingId: CAR_LISTING_ID }), 409);
    expect(insertCarOrder).not.toHaveBeenCalled();
  });

  it("ignores an offer we merely COUNTERED and never accepted", async () => {
    // `answered` on an offer means the ball is with the customer. They have not
    // taken the counter, so there is no agreement and no price of their own.
    vi.mocked(listAgreedCarEnquiriesForUser).mockResolvedValue([
      makeEnquiry({
        kind: "offer",
        status: "answered",
        offer_pesewas: ACCEPTED_OFFER_PESEWAS,
        quoted_pesewas: 17_500_000,
      }),
    ]);

    await startCarCheckout(makeUser(), { carListingId: CAR_LISTING_ID });

    // Falls back to the listing: the asking price, not the counter, and not the
    // offer they made.
    const insert = vi.mocked(insertCarOrder).mock.calls[0]![0];
    expect(insert.price_pesewas).toBe(LISTING_PESEWAS);
    expect(insert.price_source).toBe("listing");
    expect(insert.car_enquiry_id).toBeNull();
  });

  it("ignores an answered price request that carries no figure", async () => {
    // Answered with prose ("call us") and no number. There is nothing to charge.
    vi.mocked(getCarListingById).mockResolvedValue(quotedListing());
    vi.mocked(listAgreedCarEnquiriesForUser).mockResolvedValue([
      makeEnquiry({ quoted_pesewas: null }),
    ]);

    await expectApiError(startCarCheckout(makeUser(), { carListingId: CAR_LISTING_ID }), 409);
  });

  it("still refuses an unpublished car however good the quote", async () => {
    vi.mocked(getCarListingById).mockResolvedValue(
      makeListing({ is_published: false, price_state: "on_request", price_pesewas: null }),
    );
    vi.mocked(listAgreedCarEnquiriesForUser).mockResolvedValue([makeEnquiry()]);

    await expectApiError(startCarCheckout(makeUser(), { carListingId: CAR_LISTING_ID }), 409);
    expect(insertCarOrder).not.toHaveBeenCalled();
  });
});

// ── The deposit (069) ───────────────────────────────────────────────────────

describe("startCarCheckout — Paystack is asked for the deposit", () => {
  it("snapshots the full price AND the deposit, and charges only the deposit", async () => {
    await startCarCheckout(makeUser(), { carListingId: CAR_LISTING_ID });

    const insert = vi.mocked(insertCarOrder).mock.calls[0]![0];
    // The order records what the car COSTS...
    expect(insert.price_pesewas).toBe(LISTING_PESEWAS);
    // ...and what was taken up front. 30% of GH₵185,000 = GH₵55,500.
    expect(insert.deposit_pesewas).toBe(LISTING_DEPOSIT_PESEWAS);
    expect(insert.deposit_percent).toBe(30);
    // The charge itself reads `deposit_pesewas` off the row; nothing but an id
    // travels to the payment path, so no amount can be chosen by a caller.
    expect(initializePayment).toHaveBeenCalledWith(expect.anything(), {
      carOrderId: CAR_ORDER_ID,
    });
  });

  it("takes the deposit off the AGREED figure, not the asking price", async () => {
    vi.mocked(listAgreedCarEnquiriesForUser).mockResolvedValue([
      makeEnquiry({ kind: "offer", status: "accepted", offer_pesewas: ACCEPTED_OFFER_PESEWAS }),
    ]);

    await startCarCheckout(makeUser(), { carListingId: CAR_LISTING_ID });

    const insert = vi.mocked(insertCarOrder).mock.calls[0]![0];
    expect(insert.price_pesewas).toBe(ACCEPTED_OFFER_PESEWAS);
    expect(insert.deposit_pesewas).toBe(4_935_000); // 30% of GH₵164,500
  });

  it("honours an admin's percentage and rounds up to a whole pesewa", async () => {
    vi.mocked(getSiteSettingsMap).mockResolvedValue({ car_deposit_percent: "33" });
    vi.mocked(getCarListingById).mockResolvedValue(makeListing({ price_pesewas: 10_000_001 }));

    await startCarCheckout(makeUser(), { carListingId: CAR_LISTING_ID });

    // 33% of 10,000,001 is 3,300,000.33 — up, by a third of a pesewa, so the
    // deposit is never short and the balance an admin collects stays whole.
    expect(vi.mocked(insertCarOrder).mock.calls[0]![0].deposit_pesewas).toBe(3_300_001);
  });

  it("falls back to 30% when the setting is unreadable — never to the whole car", async () => {
    // Failing open at 100% would ask a MoMo wallet for GH₵185,000, which is the
    // transaction 069 exists because customers cannot complete.
    vi.mocked(getSiteSettingsMap).mockRejectedValue(new Error("site_settings: timeout"));

    await startCarCheckout(makeUser(), { carListingId: CAR_LISTING_ID });

    expect(vi.mocked(insertCarOrder).mock.calls[0]![0].deposit_pesewas).toBe(
      LISTING_DEPOSIT_PESEWAS,
    );
  });

  it("charges a 100% deposit as the whole price, with nothing left over", async () => {
    vi.mocked(getSiteSettingsMap).mockResolvedValue({ car_deposit_percent: 100 });

    await startCarCheckout(makeUser(), { carListingId: CAR_LISTING_ID });

    const insert = vi.mocked(insertCarOrder).mock.calls[0]![0];
    expect(insert.deposit_pesewas).toBe(LISTING_PESEWAS);
    expect(insert.price_pesewas - insert.deposit_pesewas).toBe(0);
  });

  it("keeps a retrying customer on the deposit THEY were quoted", async () => {
    // Their card was declined; meanwhile an admin moved the dial to 50%. The row
    // is handed back untouched and charged at its own snapshot — a retry must
    // not quietly ask for more than the first attempt did.
    const mine = makeCarOrder();
    vi.mocked(findLiveCarOrderForListing).mockResolvedValue(mine);
    vi.mocked(getSiteSettingsMap).mockResolvedValue({ car_deposit_percent: 50 });

    await startCarCheckout(makeUser(), { carListingId: CAR_LISTING_ID });

    expect(insertCarOrder).not.toHaveBeenCalled();
    expect(mine.deposit_pesewas).toBe(LISTING_DEPOSIT_PESEWAS);
  });

  it("refuses a second Paystack charge once the deposit has landed", async () => {
    // `deposit_paid` is not chargeable through this route at all: the balance is
    // arranged offline and recorded by an admin.
    vi.mocked(findLiveCarOrderForListing).mockResolvedValue(
      makeCarOrder({ status: "deposit_paid", payment_id: "p", deposit_paid_at: "now" }),
    );

    await expectApiError(startCarCheckout(makeUser(), { carListingId: CAR_LISTING_ID }), 409);
    expect(initializePayment).not.toHaveBeenCalled();
  });
});

// ── What a car page prices from (069) ───────────────────────────────────────

describe("getCarPurchaseTerms", () => {
  it("prices a plain listing, deposit and balance", async () => {
    const terms = await getCarPurchaseTerms(CAR_LISTING_ID, USER_ID);

    expect(terms).toEqual({
      payablePesewas: LISTING_PESEWAS,
      depositPesewas: LISTING_DEPOSIT_PESEWAS,
      balancePesewas: LISTING_PESEWAS - LISTING_DEPOSIT_PESEWAS,
      source: "listing",
      buyable: true,
    });
  });

  it("prices a quoted on_request car at the customer's own figure", async () => {
    vi.mocked(getCarListingById).mockResolvedValue(quotedListing());
    vi.mocked(listAgreedCarEnquiriesForUser).mockResolvedValue([makeEnquiry()]);

    const terms = await getCarPurchaseTerms(CAR_LISTING_ID, USER_ID);

    expect(terms).toMatchObject({
      payablePesewas: QUOTED_PESEWAS,
      depositPesewas: 3_600_000,
      balancePesewas: 8_400_000,
      source: "quote",
      buyable: true,
    });
  });

  it("says a signed-out visitor sees the listing, never a quote", async () => {
    vi.mocked(getCarListingById).mockResolvedValue(quotedListing());

    const terms = await getCarPurchaseTerms(CAR_LISTING_ID, null);

    expect(listAgreedCarEnquiriesForUser).not.toHaveBeenCalled();
    expect(terms).toMatchObject({ buyable: false, payablePesewas: 0 });
  });

  it("answers buyable: false for an unquoted on_request car, with no figures", async () => {
    vi.mocked(getCarListingById).mockResolvedValue(quotedListing());

    const terms = await getCarPurchaseTerms(CAR_LISTING_ID, USER_ID);

    // Zeroes, not the listing's absent price: a caller that ignores `buyable`
    // prints something obviously wrong rather than something plausibly wrong.
    expect(terms).toMatchObject({ buyable: false, payablePesewas: 0, depositPesewas: 0 });
  });

  it("never throws — a failed read is null, and the car page still renders", async () => {
    vi.mocked(getCarListingById).mockRejectedValue(new Error("car_listings: timeout"));

    await expect(getCarPurchaseTerms(CAR_LISTING_ID, USER_ID)).resolves.toBeNull();
  });

  it("is null for a car that does not exist", async () => {
    vi.mocked(getCarListingById).mockResolvedValue(null);

    await expect(getCarPurchaseTerms(CAR_LISTING_ID, USER_ID)).resolves.toBeNull();
  });

  it("agrees with what checkout charges", async () => {
    // The page and the charge must not be able to disagree: this asserts the two
    // read the same arithmetic from the same resolution.
    vi.mocked(listAgreedCarEnquiriesForUser).mockResolvedValue([
      makeEnquiry({ kind: "offer", status: "accepted", offer_pesewas: ACCEPTED_OFFER_PESEWAS }),
    ]);

    const terms = await getCarPurchaseTerms(CAR_LISTING_ID, USER_ID);
    await startCarCheckout(makeUser(), { carListingId: CAR_LISTING_ID });

    const insert = vi.mocked(insertCarOrder).mock.calls[0]![0];
    expect(terms!.payablePesewas).toBe(insert.price_pesewas);
    expect(terms!.depositPesewas).toBe(insert.deposit_pesewas);
  });
});

// ── Recording the balance (069) ─────────────────────────────────────────────

describe("recordCarBalancePayment — deposit_paid → paid", () => {
  const BALANCE = LISTING_PESEWAS - LISTING_DEPOSIT_PESEWAS; // GH₵129,500
  const admin = { id: "22222222-2222-4222-8222-222222222222", role: "admin" as const };

  function depositPaidOrder(overrides: Partial<CarOrderRow> = {}): CarOrderRow {
    return makeCarOrder({
      status: "deposit_paid",
      payment_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      deposit_paid_at: new Date().toISOString(),
      ...overrides,
    });
  }

  it("records the balance, stamps the receipt and audits the whole arithmetic", async () => {
    vi.mocked(getCarOrderById).mockResolvedValue(depositPaidOrder());
    vi.mocked(updateCarOrderStatus).mockResolvedValue(true);

    const recorded = await recordCarBalancePayment(admin, CAR_ORDER_ID, {
      amountPesewas: BALANCE,
      note: "MTN transfer, ref 88213",
    });

    expect(recorded).toBe(true);
    expect(updateCarOrderStatus).toHaveBeenCalledWith(
      CAR_ORDER_ID,
      "deposit_paid",
      "paid",
      expect.objectContaining({
        paid_at: expect.any(String),
        balance_amount_pesewas: BALANCE,
        balance_note: "MTN transfer, ref 88213",
        balance_recorded_by: admin.id,
      }),
    );
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "car_order_balance_recorded",
        entityType: "car_order",
        actorRole: "admin",
        metadata: expect.objectContaining({
          from: "deposit_paid",
          to: "paid",
          pricePesewas: LISTING_PESEWAS,
          depositPesewas: LISTING_DEPOSIT_PESEWAS,
          amountPesewas: BALANCE,
        }),
      }),
    );
  });

  it("is idempotent: a second recording writes nothing and does not throw", async () => {
    // Two admins, one balance — or one admin pressing twice. The row is already
    // `paid`, so there is nothing to do and nothing is written.
    vi.mocked(getCarOrderById).mockResolvedValue(
      makeCarOrder({ status: "paid", payment_id: "p", deposit_paid_at: "t", paid_at: "t",
        balance_amount_pesewas: BALANCE }),
    );

    const recorded = await recordCarBalancePayment(admin, CAR_ORDER_ID, { amountPesewas: BALANCE });

    expect(recorded).toBe(false);
    expect(updateCarOrderStatus).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("writes no audit row when it lost the guarded update", async () => {
    vi.mocked(getCarOrderById).mockResolvedValue(depositPaidOrder());
    vi.mocked(updateCarOrderStatus).mockResolvedValue(false);

    expect(
      await recordCarBalancePayment(admin, CAR_ORDER_ID, { amountPesewas: BALANCE }),
    ).toBe(false);
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("refuses an amount that is not the outstanding balance", async () => {
    vi.mocked(getCarOrderById).mockResolvedValue(depositPaidOrder());

    // A digit dropped: GH₵12,950 typed for a GH₵129,500 balance.
    await expectApiError(
      recordCarBalancePayment(admin, CAR_ORDER_ID, { amountPesewas: BALANCE / 10 }),
      400,
    );
    expect(updateCarOrderStatus).not.toHaveBeenCalled();
  });

  it("refuses a car whose deposit has not been paid", async () => {
    vi.mocked(getCarOrderById).mockResolvedValue(makeCarOrder());

    await expectApiError(
      recordCarBalancePayment(admin, CAR_ORDER_ID, { amountPesewas: BALANCE }),
      400,
    );
    expect(updateCarOrderStatus).not.toHaveBeenCalled();
  });

  it("refuses a cancelled car order", async () => {
    vi.mocked(getCarOrderById).mockResolvedValue(
      makeCarOrder({ status: "cancelled", cancelled_at: new Date().toISOString() }),
    );

    await expectApiError(
      recordCarBalancePayment(admin, CAR_ORDER_ID, { amountPesewas: BALANCE }),
      400,
    );
  });

  it("404s a car order that does not exist", async () => {
    vi.mocked(getCarOrderById).mockResolvedValue(null);

    await expectApiError(
      recordCarBalancePayment(admin, CAR_ORDER_ID, { amountPesewas: BALANCE }),
      404,
    );
  });
});

// ── Unwinding a sale after a deposit (069) ──────────────────────────────────

describe("releaseCarOrder — a deposit_paid car can still be unwound", () => {
  it("cancels from deposit_paid and names the deposit for whoever refunds it", async () => {
    vi.mocked(getCarOrderById).mockResolvedValue(
      makeCarOrder({ status: "deposit_paid", payment_id: "pay-1", deposit_paid_at: "t" }),
    );
    vi.mocked(updateCarOrderStatus).mockResolvedValue(true);

    const released = await releaseCarOrder(
      { id: "22222222-2222-4222-8222-222222222222", role: "admin" },
      CAR_ORDER_ID,
      "Customer walked away; deposit refunded by hand",
    );

    expect(released).toBe(true);
    // The CAS is against the status that was READ — not a fixed edge — which is
    // why the state 069 added needed no change here.
    expect(updateCarOrderStatus).toHaveBeenCalledWith(
      CAR_ORDER_ID,
      "deposit_paid",
      "cancelled",
      expect.objectContaining({ cancelled_at: expect.any(String) }),
    );
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "car_order_released",
        metadata: expect.objectContaining({
          from: "deposit_paid",
          depositPesewas: LISTING_DEPOSIT_PESEWAS,
          paymentId: "pay-1",
        }),
      }),
    );
  });

  it("is still the ONLY way out of deposit_paid — cancelCarOrder refuses it", async () => {
    // The sweep calls `cancelCarOrder` unattended every five minutes. A car
    // somebody has paid a deposit on must never be reachable from there.
    vi.mocked(getCarOrderById).mockResolvedValue(makeCarOrder({ status: "deposit_paid" }));

    await expectApiError(
      cancelCarOrder({ id: null, role: "system" }, CAR_ORDER_ID, "swept"),
      400,
    );
    expect(updateCarOrderStatus).not.toHaveBeenCalled();
  });
});
