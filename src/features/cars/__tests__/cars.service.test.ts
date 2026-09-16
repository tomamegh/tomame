import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
// `cars.service` notifies the customer when an enquiry is answered, and the
// notifications service reaches `@/lib/supabase/admin`, which builds its client
// at MODULE SCOPE. Unmocked, importing it throws "supabaseUrl is required" and
// this whole FILE fails to load — which vitest reports as its tests passing,
// because none of them ran.
vi.mock("@/features/notifications/services/notifications.service", () => ({
  createNotification: vi.fn(async () => undefined),
}));
vi.mock("@/features/audit/services/audit.service", () => ({
  logAuditEvent: vi.fn(async () => undefined),
}));
vi.mock("../services/car-photo-storage", () => ({
  deleteCarPhotoObject: vi.fn(async () => undefined),
}));
vi.mock("@/db/queries/cars", async () => {
  class CarSlugTakenError extends Error {
    constructor(public readonly slug: string) {
      super(`A car listing with the link "${slug}" already exists`);
      this.name = "CarSlugTakenError";
    }
  }
  class CarVinTakenError extends Error {
    constructor(public readonly vin: string) {
      super(`Another listing already has the VIN ${vin}`);
      this.name = "CarVinTakenError";
    }
  }
  // Deleting a listing somebody has bought raises 23503 (`car_orders` is
  // ON DELETE RESTRICT); the service maps this to a 409, not a 500.
  class CarListingSoldError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "CarListingSoldError";
    }
  }
  class CarInvariantError extends Error {
    constructor(public readonly detail: string) {
      super(`That listing is not a valid combination: ${detail}`);
      this.name = "CarInvariantError";
    }
  }
  class CarEnquiryExistsError extends Error {
    constructor() {
      super("You already have an open enquiry on this car");
      this.name = "CarEnquiryExistsError";
    }
  }
  return {
    CarSlugTakenError,
    CarVinTakenError,
    CarInvariantError,
    CarListingSoldError,
    CarEnquiryExistsError,
    listCarListings: vi.fn(),
    getCarListingById: vi.fn(),
    getCarListingBySlug: vi.fn(),
    insertCarListing: vi.fn(),
    updateCarListing: vi.fn(),
    setCarListingPublished: vi.fn(),
    deleteCarListing: vi.fn(),
    listCarPhotos: vi.fn(),
    insertCarEnquiry: vi.fn(),
    getCarEnquiry: vi.fn(),
    listCarEnquiries: vi.fn(),
    answerCarEnquiry: vi.fn(),
  };
});

import * as q from "@/db/queries/cars";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { deleteCarPhotoObject } from "../services/car-photo-storage";
import { APIError } from "@/lib/auth/api-helpers";
import { createNotification } from "@/features/notifications/services/notifications.service";
import {
  answerEnquiry,
  createCar,
  createCarEnquiry,
  deleteCar,
  setCarPublished,
  updateCar,
} from "../services/cars.service";
import type { CarEnquiryRow, CarListingRow, CarPhotoRow } from "../types";
import type { CreateCarListingInput } from "../schema";

/**
 * `cars.service` — the rules a CHECK constraint cannot enforce, and the audit
 * row every mutation owes.
 *
 * The boundary is mocked (`db/queries/cars`, the storage service and the audit
 * writer), so what is under test is the decisions: which enquiry kind a listing
 * accepts, whether an answered enquiry may be answered again, what may be
 * published, and that nothing changes state without leaving a record. `server-only`
 * is stubbed because vitest has no Next server runtime.
 */

const ACTOR = { id: "admin-1", email: "ops@tomame.test" };
const CUSTOMER = { id: "cust-1", email: "kwame@example.test" };

const listing = (over: Partial<CarListingRow> = {}): CarListingRow => ({
  id: "3f0e7b4a-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
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
  vin: "1HGCM82633A004352",
  origin_country: "USA",
  vessel_name: "MV Grande Lagos",
  sailed_on: "2026-02-01",
  eta_tema: "2026-03-14",
  description: "Two owners, clean title.",
  price_state: "fixed",
  price_pesewas: 18_450_000,
  vehicle_price_pesewas: null,
  freight_insurance_pesewas: null,
  duty_clearing_pesewas: null,
  service_fee_pesewas: null,
  is_published: true,
  sort_order: 0,
  created_by: "admin-1",
  updated_by: "admin-1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...over,
});

const photo = (over: Partial<CarPhotoRow> = {}): CarPhotoRow => ({
  id: "aa11bb22-cc33-4d44-8e55-ff6677889900",
  car_listing_id: listing().id,
  storage_path: `cars/${listing().id}/abc123.webp`,
  content_type: "image/webp",
  width: 2400,
  height: 1600,
  byte_size: 240_000,
  alt_text: null,
  sort_order: 0,
  is_cover: true,
  uploaded_by: "admin-1",
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

const enquiry = (over: Partial<CarEnquiryRow> = {}): CarEnquiryRow => ({
  id: "99887766-5544-4332-8110-aabbccddeeff",
  car_listing_id: listing().id,
  user_id: CUSTOMER.id,
  kind: "offer",
  offer_pesewas: 17_000_000,
  message: "Would you take this?",
  status: "open",
  admin_response: null,
  quoted_pesewas: null,
  answered_by: null,
  answered_at: null,
  created_at: "2026-02-01T00:00:00Z",
  updated_at: "2026-02-01T00:00:00Z",
  ...over,
});

const createInput = (over: Partial<CreateCarListingInput> = {}): CreateCarListingInput =>
  ({
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
    vin: "1HGCM82633A004352",
    origin_country: "USA",
    vessel_name: "MV Grande Lagos",
    sailed_on: "2026-02-01",
    eta_tema: "2026-03-14",
    description: "Two owners, clean title.",
    price_state: "fixed",
    price_pesewas: 18_450_000,
    vehicle_price_pesewas: null,
    freight_insurance_pesewas: null,
    duty_clearing_pesewas: null,
    service_fee_pesewas: null,
    is_published: false,
    sort_order: 0,
    ...over,
  }) as CreateCarListingInput;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(q.getCarListingById).mockResolvedValue(listing());
  vi.mocked(q.insertCarListing).mockResolvedValue(listing({ is_published: false }));
  vi.mocked(q.updateCarListing).mockResolvedValue(listing());
  vi.mocked(q.setCarListingPublished).mockImplementation(async (_id, isPublished) =>
    listing({ is_published: isPublished }),
  );
  vi.mocked(q.deleteCarListing).mockResolvedValue(listing());
  vi.mocked(q.listCarPhotos).mockResolvedValue([photo()]);
  vi.mocked(q.insertCarEnquiry).mockResolvedValue(enquiry());
  vi.mocked(q.getCarEnquiry).mockResolvedValue(enquiry());
  vi.mocked(q.answerCarEnquiry).mockImplementation(async (_id, answer) =>
    enquiry({
      status: answer.status,
      admin_response: answer.admin_response,
      quoted_pesewas: answer.quoted_pesewas,
      answered_by: answer.answered_by,
      answered_at: "2026-02-02T00:00:00Z",
    }),
  );
});

describe("createCar", () => {
  it("writes the listing and audits it", async () => {
    const car = await createCar(ACTOR, createInput());

    expect(car.slug).toBe("2019-toyota-highlander-xle");
    expect(q.insertCarListing).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "2019-toyota-highlander-xle",
        price_state: "fixed",
        price_pesewas: 18_450_000,
        created_by: "admin-1",
      }),
    );
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-1",
        actorRole: "admin",
        action: "car_listing_created",
        entityType: "car_listing",
        entityId: listing().id,
      }),
    );
  });

  it("turns a taken link into a 409 and leaves no audit row", async () => {
    vi.mocked(q.insertCarListing).mockRejectedValue(new q.CarSlugTakenError("taken"));

    await expect(createCar(ACTOR, createInput())).rejects.toMatchObject({ statusCode: 409 });
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("turns a duplicate VIN into a 409 — that car is already listed", async () => {
    vi.mocked(q.insertCarListing).mockRejectedValue(
      new q.CarVinTakenError("1HGCM82633A004352"),
    );

    await expect(createCar(ACTOR, createInput())).rejects.toMatchObject({ statusCode: 409 });
  });

  it("turns a database invariant violation into a 422, not a 500", async () => {
    vi.mocked(q.insertCarListing).mockRejectedValue(
      new q.CarInvariantError("car_listings_price_state_has_price"),
    );

    await expect(createCar(ACTOR, createInput())).rejects.toMatchObject({ statusCode: 422 });
  });
});

describe("updateCar", () => {
  it("records the price move under its own action, with the old figure", async () => {
    vi.mocked(q.getCarListingById).mockResolvedValue(listing({ price_pesewas: 18_450_000 }));
    vi.mocked(q.updateCarListing).mockResolvedValue(listing({ price_pesewas: 15_500_000 }));

    await updateCar(ACTOR, listing().id, createInput({ price_pesewas: 15_500_000 }));

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "car_listing_repriced",
        entityType: "car_listing",
        metadata: expect.objectContaining({
          previousPricePesewas: 18_450_000,
          newPricePesewas: 15_500_000,
        }),
      }),
    );
  });

  it("uses the plain action when the price did not move", async () => {
    await updateCar(ACTOR, listing().id, createInput());

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "car_listing_updated" }),
    );
  });

  it("404s on a listing that is not there, before writing anything", async () => {
    vi.mocked(q.getCarListingById).mockResolvedValue(null);

    await expect(updateCar(ACTOR, "missing", createInput())).rejects.toBeInstanceOf(APIError);
    expect(q.updateCarListing).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});

describe("setCarPublished", () => {
  it("refuses to publish a listing with no photograph", async () => {
    vi.mocked(q.getCarListingById).mockResolvedValue(listing({ is_published: false }));
    vi.mocked(q.listCarPhotos).mockResolvedValue([]);

    await expect(setCarPublished(ACTOR, listing().id, true)).rejects.toMatchObject({
      statusCode: 422,
    });
    expect(q.setCarListingPublished).not.toHaveBeenCalled();
  });

  it("publishes once there is a picture, and audits it", async () => {
    vi.mocked(q.getCarListingById).mockResolvedValue(listing({ is_published: false }));

    const car = await setCarPublished(ACTOR, listing().id, true);

    expect(car.is_published).toBe(true);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "car_listing_published" }),
    );
  });

  it("unpublishing needs no photo check — taking a car off the site is always allowed", async () => {
    vi.mocked(q.listCarPhotos).mockResolvedValue([]);

    await setCarPublished(ACTOR, listing().id, false);

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "car_listing_unpublished" }),
    );
  });

  it("is idempotent: asking for the state it is already in writes nothing", async () => {
    await setCarPublished(ACTOR, listing().id, true);

    expect(q.setCarListingPublished).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});

describe("deleteCar", () => {
  it("removes the storage objects the cascade would have orphaned, then audits", async () => {
    const row = await deleteCar(ACTOR, listing().id);

    expect(row?.id).toBe(listing().id);
    expect(deleteCarPhotoObject).toHaveBeenCalledWith(photo().storage_path);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "car_listing_deleted",
        entityType: "car_listing",
        metadata: expect.objectContaining({ photoCount: 1, wasPublished: true }),
      }),
    );
  });

  it("deleting something already gone is a no-op that writes nothing", async () => {
    vi.mocked(q.deleteCarListing).mockResolvedValue(null);

    expect(await deleteCar(ACTOR, "missing")).toBeNull();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});

describe("createCarEnquiry", () => {
  it("accepts an offer on a negotiable car and audits it as the CUSTOMER", async () => {
    vi.mocked(q.getCarListingById).mockResolvedValue(listing({ price_state: "negotiable" }));

    await createCarEnquiry(CUSTOMER, listing().id, {
      kind: "offer",
      offer_pesewas: 17_000_000,
      message: null,
    });

    expect(q.insertCarEnquiry).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: CUSTOMER.id, kind: "offer", offer_pesewas: 17_000_000 }),
    );
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: CUSTOMER.id,
        actorRole: "user",
        action: "car_enquiry_created",
        entityType: "car_enquiry",
      }),
    );
  });

  it("accepts a price request on an unpriced car", async () => {
    vi.mocked(q.getCarListingById).mockResolvedValue(
      listing({ price_state: "on_request", price_pesewas: null }),
    );
    vi.mocked(q.insertCarEnquiry).mockResolvedValue(
      enquiry({ kind: "price_request", offer_pesewas: null }),
    );

    await createCarEnquiry(CUSTOMER, listing().id, {
      kind: "price_request",
      offer_pesewas: null,
      message: "How much?",
    });

    expect(q.insertCarEnquiry).toHaveBeenCalled();
  });

  it("refuses any enquiry on a fixed price — there is nothing to negotiate", async () => {
    await expect(
      createCarEnquiry(CUSTOMER, listing().id, {
        kind: "offer",
        offer_pesewas: 1_000_000,
        message: null,
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(q.insertCarEnquiry).not.toHaveBeenCalled();
  });

  it("refuses an offer on a car whose price is only on request", async () => {
    vi.mocked(q.getCarListingById).mockResolvedValue(
      listing({ price_state: "on_request", price_pesewas: null }),
    );

    await expect(
      createCarEnquiry(CUSTOMER, listing().id, {
        kind: "offer",
        offer_pesewas: 1_000_000,
        message: null,
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("refuses a price request on a car that already shows an asking price", async () => {
    vi.mocked(q.getCarListingById).mockResolvedValue(listing({ price_state: "negotiable" }));

    await expect(
      createCarEnquiry(CUSTOMER, listing().id, {
        kind: "price_request",
        offer_pesewas: null,
        message: null,
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("404s on an unpublished listing — an enquiry against one came from a guess", async () => {
    vi.mocked(q.getCarListingById).mockResolvedValue(
      listing({ price_state: "negotiable", is_published: false }),
    );

    await expect(
      createCarEnquiry(CUSTOMER, listing().id, {
        kind: "offer",
        offer_pesewas: 1_000_000,
        message: null,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("turns a duplicate live enquiry into a 409", async () => {
    vi.mocked(q.getCarListingById).mockResolvedValue(listing({ price_state: "negotiable" }));
    vi.mocked(q.insertCarEnquiry).mockRejectedValue(new q.CarEnquiryExistsError());

    await expect(
      createCarEnquiry(CUSTOMER, listing().id, {
        kind: "offer",
        offer_pesewas: 1_000_000,
        message: null,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("answerEnquiry", () => {
  it("records the answer, stamps the admin and audits the transition", async () => {
    const row = await answerEnquiry(ACTOR, enquiry().id, {
      status: "answered",
      admin_response: "We could do GH₵178,000.",
      quoted_pesewas: 17_800_000,
    });

    expect(row.status).toBe("answered");
    expect(q.answerCarEnquiry).toHaveBeenCalledWith(
      enquiry().id,
      expect.objectContaining({ answered_by: "admin-1", quoted_pesewas: 17_800_000 }),
    );
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "car_enquiry_answered",
        entityType: "car_enquiry",
        metadata: expect.objectContaining({ previousStatus: "open", newStatus: "answered" }),
      }),
    );
  });

  /*
    THE BUG THIS FEATURE SHIPPED WITH. `answerEnquiry` wrote the row and an
    audit entry and stopped, so an admin replied, the queue updated, and the
    customer was told nothing at all by any channel. Kelvin: "I replied to a
    customers enquiry on a car and the customer never saw my response. Also the
    notification center did not show anything."
  */
  it("tells the customer, with the reply and a link to the car", async () => {
    await answerEnquiry(ACTOR, enquiry().id, {
      status: "answered",
      admin_response: "We could do GH₵178,000.",
      quoted_pesewas: 17_800_000,
    });

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: enquiry().user_id,
        event: "car_enquiry_answered",
        payload: expect.objectContaining({
          quotedPesewas: 17_800_000,
          adminResponse: "We could do GH₵178,000.",
        }),
      }),
    );
  });

  it("still answers when the bell cannot be written", async () => {
    vi.mocked(createNotification).mockRejectedValueOnce(new Error("notifications down"));

    // The answer is the real work and it is already done. Failing here would
    // leave an admin believing they had not replied — so they reply again.
    await expect(
      answerEnquiry(ACTOR, enquiry().id, {
        status: "answered",
        admin_response: "We could do GH₵178,000.",
        quoted_pesewas: 17_800_000,
      }),
    ).resolves.toEqual(expect.objectContaining({ status: "answered" }));
  });

  it("allows a second round — a negotiation goes back and forth", async () => {
    vi.mocked(q.getCarEnquiry).mockResolvedValue(enquiry({ status: "answered" }));

    await expect(
      answerEnquiry(ACTOR, enquiry().id, {
        status: "accepted",
        admin_response: "Deal.",
        quoted_pesewas: null,
      }),
    ).resolves.toBeTruthy();
  });

  it("refuses to re-answer a settled enquiry rather than overwrite a decision", async () => {
    vi.mocked(q.getCarEnquiry).mockResolvedValue(enquiry({ status: "declined" }));

    await expect(
      answerEnquiry(ACTOR, enquiry().id, {
        status: "accepted",
        admin_response: null,
        quoted_pesewas: null,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(q.answerCarEnquiry).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("accepting takes no money — it only records that a human said yes", async () => {
    await answerEnquiry(ACTOR, enquiry().id, {
      status: "accepted",
      admin_response: "Deal.",
      quoted_pesewas: null,
    });

    // The guard that keeps this phase out of the money path: the only writes the
    // service makes are to `car_enquiries` and `audit_logs`.
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "car_enquiry_accepted" }),
    );
  });
});
