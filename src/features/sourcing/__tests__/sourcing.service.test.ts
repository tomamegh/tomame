import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { app: { url: "https://tomame.test" } } }));
vi.mock("@/features/extraction/extraction.service", () => ({ getExtractionSnapshot: vi.fn() }));
vi.mock("@/features/extraction/quote.service", () => ({ priceExtraction: vi.fn() }));
vi.mock("@/features/bag/services/bag.service", () => ({ addToBag: vi.fn() }));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn(async () => undefined) }));
vi.mock("@/db/queries/carts", () => ({ getCartItemById: vi.fn(), updateCartItem: vi.fn(async () => null) }));
vi.mock("@/db/queries/notifications", () => ({
  insertNotification: vi.fn(async () => ({ id: "notif-1" })),
  markNotificationDelivered: vi.fn(async () => undefined),
  getRecipientEmail: vi.fn(async () => "k@example.test"),
}));
vi.mock("@/lib/email/transport", () => ({ sendEmail: vi.fn(async () => undefined) }));
vi.mock("@/lib/email/notify-preference", () => ({ mayEmailUser: vi.fn(async () => true) }));
// Reached transitively through the pricing types; it builds the admin client at
// module scope, which a unit test has no credentials for.
vi.mock("@/lib/exchange-rates/service", () => ({ getGhsRate: vi.fn(async () => 15) }));
vi.mock("@/db/queries/price-watches", () => ({
  upsertSourcingRequest: vi.fn(),
  answerSourcingRequest: vi.fn(),
  getSourcingByCartItems: vi.fn(async () => new Map()),
  listSourcingRequests: vi.fn(async () => []),
  getWatchByUserAndHash: vi.fn(async () => null),
}));

import { getExtractionSnapshot } from "@/features/extraction/extraction.service";
import { priceExtraction } from "@/features/extraction/quote.service";
import { addToBag } from "@/features/bag/services/bag.service";
import { getCartItemById, updateCartItem } from "@/db/queries/carts";
import { insertNotification, markNotificationDelivered } from "@/db/queries/notifications";
import { sendEmail } from "@/lib/email/transport";
import { mayEmailUser } from "@/lib/email/notify-preference";
import {
  answerSourcingRequest,
  getWatchByUserAndHash,
  upsertSourcingRequest,
} from "@/db/queries/price-watches";
import type { PriceWatchRow } from "@/db/queries/price-watches";
import type { ExtractionResult } from "@/features/extraction/types";
import type { PlatformUser } from "@/features/users/types";
import { answerSourcing, requestSourcing } from "../services/sourcing.service";

const USER = { id: "u1" } as unknown as PlatformUser;
const VIEWER = { userId: "u1", sessionId: null };
const CACHE_ID = "11111111-1111-1111-1111-111111111111";

/** An unknown store: what the feature exists for. */
function snapshot(over: Partial<ExtractionResult["product"]> = {}, platform = "generic", country: ExtractionResult["country"] = null) {
  return {
    id: CACHE_ID,
    productUrl: "https://www.walmartcontacts.com/lens/acuvue-2",
    result: {
      extraction_attempted: true,
      extraction_success: true,
      platform,
      country,
      product: { title: "ACUVUE 2", price: 29.99, currency: "USD", image: null, ...over },
      messages: [],
      errors: [],
      source: null,
      sources: [],
      confidence: {},
      fetched_at: "2026-09-14T00:00:00Z",
    } as unknown as ExtractionResult,
  };
}

function watchRow(over: Partial<PriceWatchRow> = {}): PriceWatchRow {
  return {
    id: "w1", user_id: "u1", product_url: "https://www.walmartcontacts.com/lens/acuvue-2",
    url_hash: "h", product_name: "ACUVUE 2", product_image_url: null, extraction_cache_id: CACHE_ID,
    baseline_price_usd: null, baseline_total_ghs: null, last_price_usd: null, last_total_ghs: null,
    last_checked_at: null, consecutive_failures: 0, last_error: null, notify_on_drop: false,
    notified_at: null, notified_price_usd: null, is_active: true, kind: "sourcing",
    sourcing_status: "available", sourcing_cart_item_id: "line-1", sourced_price_usd: 34.5,
    sourced_origin_country: "USA", sourced_note: "In stock, ships from NJ.",
    customer_price_hint_usd: null, customer_origin_hint: null, reviewed_by: "admin-1",
    reviewed_at: "2026-09-14T00:00:00Z", created_at: "", updated_at: "",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getExtractionSnapshot).mockResolvedValue(snapshot());
  vi.mocked(priceExtraction).mockResolvedValue({ pricing: null, reason: "This store region is not supported yet." });
  vi.mocked(addToBag).mockResolvedValue({ line: { id: "line-1" }, item_count: 1, created: true } as never);
  vi.mocked(upsertSourcingRequest).mockImplementation(async (input) => watchRow({ sourcing_status: input.sourcing_status }));
  vi.mocked(getWatchByUserAndHash).mockResolvedValue(null);
});

describe("requestSourcing — the gate", () => {
  it("accepts an item from a store we do not know", async () => {
    const out = await requestSourcing(USER, VIEWER, { extraction_cache_id: CACHE_ID, quantity: 1 });
    expect(out.status).toBe("requested");
    expect(addToBag).toHaveBeenCalled();
  });

  /**
   * The guard used to pass `hasPricing: false` unconditionally, which made
   * `needsSourcing`'s last clause true for EVERY ordinary listing — so the 400
   * never fired and anything at all could be pushed into a buyer's queue.
   */
  it("refuses an ordinary priced listing from a store we know", async () => {
    vi.mocked(getExtractionSnapshot).mockResolvedValue(snapshot({}, "amazon", "USA"));
    vi.mocked(priceExtraction).mockResolvedValue({
      pricing: { pricing_method: "flat_rate", total_ghs: 5041 } as never,
      reason: null,
    });

    await expect(
      requestSourcing(USER, VIEWER, { extraction_cache_id: CACHE_ID, quantity: 1 }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(addToBag).not.toHaveBeenCalled();
  });

  /**
   * A review verdict is a breakdown of zeroes, not a price. Reading it as one
   * here would turn away exactly the items that DO need a person.
   */
  it("accepts a known store whose breakdown came back as needs_review", async () => {
    vi.mocked(getExtractionSnapshot).mockResolvedValue(snapshot({}, "amazon", "USA"));
    vi.mocked(priceExtraction).mockResolvedValue({
      pricing: { pricing_method: "needs_review", total_ghs: 0 } as never,
      reason: null,
    });

    const out = await requestSourcing(USER, VIEWER, { extraction_cache_id: CACHE_ID, quantity: 1 });
    expect(out.status).toBe("requested");
  });

  /**
   * Pressing the button again after a buyer has answered must not re-queue
   * finished work: the upsert rewrites every column it is given, so the status
   * has to come from the row that is already there.
   */
  it("keeps an already-answered request at its answer instead of resetting it", async () => {
    vi.mocked(getWatchByUserAndHash).mockResolvedValue(watchRow({ sourcing_status: "available" }));

    const out = await requestSourcing(USER, VIEWER, { extraction_cache_id: CACHE_ID, quantity: 1 });

    expect(upsertSourcingRequest).toHaveBeenCalledWith(
      expect.objectContaining({ sourcing_status: "available" }),
    );
    expect(out.status).toBe("available");
  });

  it("starts a price watch being converted into a request at requested", async () => {
    vi.mocked(getWatchByUserAndHash).mockResolvedValue(
      watchRow({ kind: "price", sourcing_status: null }),
    );
    await requestSourcing(USER, VIEWER, { extraction_cache_id: CACHE_ID, quantity: 1 });
    expect(upsertSourcingRequest).toHaveBeenCalledWith(
      expect.objectContaining({ sourcing_status: "requested" }),
    );
  });

  it("never writes the customer's guess where the bag could price against it", async () => {
    await requestSourcing(USER, VIEWER, {
      extraction_cache_id: CACHE_ID,
      quantity: 1,
      estimated_price_usd: 20,
      origin_country: "UK",
    });
    // A hint for the buyer, kept apart from `sourced_*`.
    expect(upsertSourcingRequest).toHaveBeenCalledWith(
      expect.objectContaining({ customer_price_hint_usd: 20, customer_origin_hint: "UK" }),
    );
    // And never onto the line itself.
    expect(addToBag).toHaveBeenCalledWith(VIEWER, { extraction_cache_id: CACHE_ID, quantity: 1 });
  });
});

describe("answerSourcing", () => {
  beforeEach(() => {
    vi.mocked(answerSourcingRequest).mockResolvedValue(watchRow());
    vi.mocked(getCartItemById).mockResolvedValue({ id: "line-1" } as never);
  });

  it("writes the buyer's price to the authoritative column, not the gap-filler", async () => {
    await answerSourcing("admin-1", "w1", {
      from: "requested",
      status: "available",
      price_usd: 34.5,
      origin_country: "USA",
    });
    expect(updateCartItem).toHaveBeenCalledWith(
      "line-1",
      expect.objectContaining({ sourced_price_usd: 34.5, gap_origin_country: "USA", pricing: null }),
    );
  });

  it("guards the transition on the status the buyer saw", async () => {
    await answerSourcing("admin-1", "w1", { from: "requested", status: "available", price_usd: 1, origin_country: "USA" });
    expect(answerSourcingRequest).toHaveBeenCalledWith("w1", "requested", expect.anything());
  });

  it("409s when someone else answered first", async () => {
    vi.mocked(answerSourcingRequest).mockResolvedValue(null);
    await expect(
      answerSourcing("admin-1", "w1", { from: "requested", status: "unavailable" }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("refuses to mark something available with nothing attached to pay against", async () => {
    await expect(
      answerSourcing("admin-1", "w1", { from: "requested", status: "available", origin_country: "USA" }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      answerSourcing("admin-1", "w1", { from: "requested", status: "available", price_usd: 10 }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(answerSourcingRequest).not.toHaveBeenCalled();
  });

  /** The row is not the message: an insert with no send leaves the promise unkept. */
  it("sends the email and marks the notification delivered", async () => {
    await answerSourcing("admin-1", "w1", { from: "requested", status: "available", price_usd: 34.5, origin_country: "USA" });

    expect(insertNotification).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "u1", event: "sourcing_available" }),
    );
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "k@example.test", subject: expect.stringContaining("We can get it") }),
    );
    expect(markNotificationDelivered).toHaveBeenCalledWith("notif-1", expect.objectContaining({ status: "sent" }));
  });

  it("still marks it sent for a customer who has email turned off", async () => {
    vi.mocked(mayEmailUser).mockResolvedValue(false);
    await answerSourcing("admin-1", "w1", { from: "requested", status: "available", price_usd: 34.5, origin_country: "USA" });
    expect(sendEmail).not.toHaveBeenCalled();
    // They HAVE been told, through the channel they allow.
    expect(markNotificationDelivered).toHaveBeenCalledWith("notif-1", expect.objectContaining({ status: "sent" }));
  });

  it("keeps the answer when the line has left the bag", async () => {
    vi.mocked(getCartItemById).mockResolvedValue(null);
    const out = await answerSourcing("admin-1", "w1", { from: "requested", status: "available", price_usd: 34.5, origin_country: "USA" });
    expect(out.sourcing_status).toBe("available");
    expect(updateCartItem).not.toHaveBeenCalled();
  });
});
