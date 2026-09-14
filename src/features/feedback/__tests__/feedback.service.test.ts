import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/db/queries/order-feedback", () => ({
  insertOrderFeedback: vi.fn(),
  listOrderFeedback: vi.fn(async () => []),
  listOrderFeedbackForOrder: vi.fn(async () => []),
  transitionOrderFeedback: vi.fn(),
}));
vi.mock("@/db/queries/orders", () => ({ getOrderOwner: vi.fn() }));
vi.mock("@/db/queries/order-photos", () => ({ getOrderPhoto: vi.fn() }));
vi.mock("@/features/audit/services/audit.service", () => ({
  logAuditEvent: vi.fn(async () => undefined),
}));

import {
  insertOrderFeedback,
  listOrderFeedbackForOrder,
  transitionOrderFeedback,
} from "@/db/queries/order-feedback";
import { getOrderOwner } from "@/db/queries/orders";
import { getOrderPhoto } from "@/db/queries/order-photos";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { APIError } from "@/lib/auth/api-helpers";
import {
  listCustomerOrderFeedback,
  moveOrderFeedback,
  submitOrderFeedback,
} from "../services/feedback.service";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";

const customer = (over: Record<string, unknown> = {}) =>
  ({
    id: "u1",
    profile: { id: "u1", role: "user" },
    ...over,
  }) as never;

const row = (over: Record<string, unknown> = {}) =>
  ({
    id: "fb-1",
    order_id: ORDER_ID,
    photo_id: null,
    user_id: "u1",
    verdict: "wrong_item",
    message: "This is a blue one, I ordered black",
    status: "open",
    handled_by: null,
    resolution: null,
    resolved_at: null,
    created_at: "2026-09-14T10:00:00Z",
    updated_at: "2026-09-14T10:00:00Z",
    ...over,
  }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getOrderOwner).mockResolvedValue({ id: ORDER_ID, user_id: "u1" });
  vi.mocked(insertOrderFeedback).mockResolvedValue(row());
});

describe("submitOrderFeedback", () => {
  it("refuses an order the customer does not own, as a 404", async () => {
    vi.mocked(getOrderOwner).mockResolvedValue({ id: ORDER_ID, user_id: "someone-else" });

    // 404 rather than 403 on purpose: a 403 would confirm the id exists.
    await expect(
      submitOrderFeedback(customer(), ORDER_ID, {
        verdict: "wrong_item",
        message: "Not mine but I want to complain about it",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(insertOrderFeedback).not.toHaveBeenCalled();
  });

  it("refuses an order that does not exist", async () => {
    vi.mocked(getOrderOwner).mockResolvedValue(null);

    await expect(
      submitOrderFeedback(customer(), ORDER_ID, { verdict: "damaged", message: "dented" }),
    ).rejects.toBeInstanceOf(APIError);
    expect(insertOrderFeedback).not.toHaveBeenCalled();
  });

  it("is not a role check — an admin looking at someone else's order is refused too", async () => {
    vi.mocked(getOrderOwner).mockResolvedValue({ id: ORDER_ID, user_id: "u1" });

    await expect(
      submitOrderFeedback(
        customer({ id: "admin-1", profile: { id: "admin-1", role: "admin" } }),
        ORDER_ID,
        { verdict: "wrong_item", message: "looks off to me" },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("accepts 'looks_right' with nothing typed, and supplies the words", async () => {
    vi.mocked(insertOrderFeedback).mockResolvedValue(
      row({ verdict: "looks_right", message: "Looks right to me." }),
    );

    const result = await submitOrderFeedback(customer(), ORDER_ID, { verdict: "looks_right" });

    expect(insertOrderFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: ORDER_ID,
        userId: "u1",
        verdict: "looks_right",
        message: "Looks right to me.",
      }),
    );
    expect(result.verdict).toBe("looks_right");
  });

  it("still insists on words for a complaint", async () => {
    await expect(
      submitOrderFeedback(customer(), ORDER_ID, { verdict: "wrong_item", message: "   " }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(insertOrderFeedback).not.toHaveBeenCalled();
  });

  it("writes an audit row naming the order and the verdict", async () => {
    await submitOrderFeedback(customer(), ORDER_ID, {
      verdict: "wrong_variant",
      message: "the 64GB, not the 32",
    });

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "u1",
        actorRole: "user",
        action: "order_feedback_submitted",
        entityType: "order_feedback",
        entityId: "fb-1",
        metadata: expect.objectContaining({ order_id: ORDER_ID, verdict: "wrong_variant" }),
      }),
    );
  });

  it("never returns the staff columns to the browser", async () => {
    vi.mocked(insertOrderFeedback).mockResolvedValue(row({ handled_by: "admin-1" }));

    const result = await submitOrderFeedback(customer(), ORDER_ID, {
      verdict: "damaged",
      message: "the corner is crushed",
    });

    expect(result).not.toHaveProperty("handled_by");
    expect(result).not.toHaveProperty("user_id");
  });
});

describe("listCustomerOrderFeedback", () => {
  it("refuses somebody else's order", async () => {
    vi.mocked(getOrderOwner).mockResolvedValue({ id: ORDER_ID, user_id: "someone-else" });

    await expect(listCustomerOrderFeedback(customer(), ORDER_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(listOrderFeedbackForOrder).not.toHaveBeenCalled();
  });

  it("lets an admin read it — the admin order screen renders the same list", async () => {
    vi.mocked(getOrderOwner).mockResolvedValue({ id: ORDER_ID, user_id: "u1" });
    vi.mocked(listOrderFeedbackForOrder).mockResolvedValue([row()]);

    // A REAL admin carries the role claim on the JWT. `canAccessAdmin` reads
    // `app_metadata.role`, which is what every other admin surface reads.
    const result = await listCustomerOrderFeedback(
      customer({
        id: "admin-1",
        app_metadata: { role: "admin" },
        profile: { id: "admin-1", role: "admin" },
      }),
      ORDER_ID,
    );
    expect(result).toHaveLength(1);
  });

  it("refuses a profile row that says admin but carries no role claim", async () => {
    // The two signals part company wherever `custom_access_token_hook` has not
    // run. This path used to read `user.profile.role` alone, so such an account
    // could read any customer's words here while being bounced from /admin and
    // from every other /api/admin route. One rule now, and this is it.
    vi.mocked(getOrderOwner).mockResolvedValue({ id: ORDER_ID, user_id: "someone-else" });

    await expect(
      listCustomerOrderFeedback(
        customer({ id: "admin-2", profile: { id: "admin-2", role: "admin" } }),
        ORDER_ID,
      ),
    ).rejects.toThrow(APIError);
    expect(listOrderFeedbackForOrder).not.toHaveBeenCalled();
  });
});

describe("moveOrderFeedback", () => {
  it("refuses a claim on a row somebody else already claimed", async () => {
    // The guarded UPDATE matched nothing, which is how a lost race presents.
    vi.mocked(transitionOrderFeedback).mockResolvedValue(null);

    await expect(
      moveOrderFeedback("admin-1", "fb-1", { from: "open", status: "in_review" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("guards the transition on the status the admin saw", async () => {
    vi.mocked(transitionOrderFeedback).mockResolvedValue(row({ status: "in_review" }));

    await moveOrderFeedback("admin-1", "fb-1", { from: "open", status: "in_review" });

    expect(transitionOrderFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ id: "fb-1", from: "open", to: "in_review", handledBy: "admin-1" }),
    );
  });

  it("audits every admin move with both ends of the transition", async () => {
    vi.mocked(transitionOrderFeedback).mockResolvedValue(
      row({ status: "resolved", resolution: "Re-bought the black one" }),
    );

    await moveOrderFeedback("admin-1", "fb-1", {
      from: "in_review",
      status: "resolved",
      resolution: "Re-bought the black one",
    });

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-1",
        actorRole: "admin",
        action: "order_feedback_updated",
        entityType: "order_feedback",
        entityId: "fb-1",
        metadata: expect.objectContaining({
          order_id: ORDER_ID,
          from: "in_review",
          to: "resolved",
        }),
      }),
    );
  });
});

describe("photo_id is pinned to the order being commented on", () => {
  const PHOTO = "22222222-2222-4222-8222-222222222222";
  const OTHER_ORDER = "33333333-3333-4333-8333-333333333333";

  beforeEach(() => {
    vi.mocked(getOrderOwner).mockResolvedValue({ id: ORDER_ID, user_id: "u1" } as never);
    vi.mocked(insertOrderFeedback).mockImplementation(
      (async (input: { photoId: string | null }) => row({ photo_id: input.photoId })) as never,
    );
  });

  it("keeps a photo that belongs to this order", async () => {
    vi.mocked(getOrderPhoto).mockResolvedValue({ id: PHOTO, order_id: ORDER_ID } as never);

    await submitOrderFeedback(customer(), ORDER_ID, {
      verdict: "damaged",
      message: "Dented corner.",
      photo_id: PHOTO,
    } as never);

    expect(vi.mocked(insertOrderFeedback).mock.calls[0]![0]).toMatchObject({ photoId: PHOTO });
  });

  it("drops a photo that belongs to someone else's order, but keeps the complaint", async () => {
    // Confirmed against the running app before this test existed: the endpoint
    // answered 201 and stored the foreign id, so the admin queue would show one
    // customer's words beside another customer's parcel — on the screen where a
    // person decides whether to stop a box.
    vi.mocked(getOrderPhoto).mockResolvedValue({ id: PHOTO, order_id: OTHER_ORDER } as never);

    await submitOrderFeedback(customer(), ORDER_ID, {
      verdict: "damaged",
      message: "Pointing at a stranger's photo.",
      photo_id: PHOTO,
    } as never);

    const written = vi.mocked(insertOrderFeedback).mock.calls[0]![0];
    expect(written).toMatchObject({ photoId: null });
    // The words still land: losing a real complaint over a stale reference
    // would be the worse failure.
    expect(written.message).toBe("Pointing at a stranger's photo.");
  });

  it("drops a photo id that does not exist at all", async () => {
    vi.mocked(getOrderPhoto).mockResolvedValue(null as never);

    await submitOrderFeedback(customer(), ORDER_ID, {
      verdict: "other",
      message: "Stale id.",
      photo_id: PHOTO,
    } as never);

    expect(vi.mocked(insertOrderFeedback).mock.calls[0]![0]).toMatchObject({ photoId: null });
  });

  it("does not look a photo up when none was given", async () => {
    await submitOrderFeedback(customer(), ORDER_ID, {
      verdict: "looks_right",
    } as never);

    expect(getOrderPhoto).not.toHaveBeenCalled();
    expect(vi.mocked(insertOrderFeedback).mock.calls[0]![0]).toMatchObject({ photoId: null });
  });
});
