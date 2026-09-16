import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const from = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from }) }));

import { CarListingSoldError, deleteCarListing } from "../cars";

/**
 * What a Postgres refusal costs the admin who caused it.
 *
 * `car_orders.car_listing_id` is `ON DELETE RESTRICT` (068), so deleting a car
 * somebody has bought raises 23503 and the row stays — the right answer, since
 * the cascade would take the record of a five-figure sale with it. What was
 * WRONG was how it arrived: an unexplained 500 carrying a raw constraint name,
 * from which no admin could work out that the thing they actually wanted
 * (taking the listing off the site) is one button away under Unpublish.
 */

function respond(error: { code?: string; message: string; details?: string } | null) {
  const chain: Record<string, unknown> = {
    delete: () => chain,
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => ({ data: error ? null : { id: "car-1" }, error }),
  };
  from.mockReturnValue(chain);
}

beforeEach(() => vi.clearAllMocks());

describe("deleteCarListing — a car somebody bought", () => {
  it("explains the refusal and names the way out", async () => {
    respond({
      code: "23503",
      message:
        'update or delete on table "car_listings" violates foreign key constraint "car_orders_car_listing_id_fkey" on table "car_orders"',
      details: 'Key (id)=(car-1) is still referenced from table "car_orders".',
    });

    await expect(deleteCarListing("car-1")).rejects.toBeInstanceOf(CarListingSoldError);
    // The sentence itself is the feature: it says what happened and what to do
    // instead, in the admin's words rather than Postgres's.
    await expect(deleteCarListing("car-1")).rejects.toThrow(/has been bought/);
    await expect(deleteCarListing("car-1")).rejects.toThrow(/Unpublish it instead/);
  });

  it("reads the referencing table out of `details` when that is where it lands", async () => {
    // Which of the two PostgREST forwards has moved between versions, and a
    // message this one is worth being right about either way.
    respond({
      code: "23503",
      message: "violates foreign key constraint",
      details: 'Key (id)=(car-1) is still referenced from table "car_orders".',
    });

    await expect(deleteCarListing("car-1")).rejects.toBeInstanceOf(CarListingSoldError);
  });

  it("does not claim a sale for a foreign key that has nothing to do with one", async () => {
    // 23503 is the code for EVERY foreign key on these tables. A `created_by`
    // naming a profile that no longer exists is a bug in the caller, and telling
    // the admin to unpublish the listing over it would send them chasing
    // something that is not wrong.
    respond({
      code: "23503",
      message:
        'insert or update on table "car_listings" violates foreign key constraint "car_listings_created_by_fkey"',
      details: 'Key (created_by)=(u-9) is not present in table "profiles".',
    });

    const failure = await deleteCarListing("car-1").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(CarListingSoldError);
  });

  it("hands back the deleted row when nothing is pointing at it", async () => {
    respond(null);
    expect(await deleteCarListing("car-1")).toMatchObject({ id: "car-1" });
  });
});
