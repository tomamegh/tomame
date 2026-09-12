import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { app: { url: "http://localhost:3000" } } }));
vi.mock("@/lib/email/transport", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { getUserById: vi.fn(async () => ({ data: null, error: null })) } } }),
}));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/features/quotes/services/quote-lock.service", () => ({ consumeQuoteLocksForOrder: vi.fn(async () => ["lock-1"]) }));
vi.mock("../services/order-intake.service", () => ({ buildOrderIntake: vi.fn() }));
vi.mock("@/lib/supabase/errors", () => ({
  isSchemaMissingError: (e: unknown) => /could not find the table|does not exist/i.test(e instanceof Error ? e.message : String(e)),
}));

import type { SupabaseClient } from "@supabase/supabase-js";
import { consumeQuoteLocksForOrder } from "@/features/quotes/services/quote-lock.service";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { buildOrderIntake, type OrderIntake } from "../services/order-intake.service";
import { createOrder } from "../services/orders.service";
import type { PlatformUser } from "@/features/users/types";

const CACHE_ID = "b4c99974-a1b4-4b49-ac8f-42dd0a0626d8";
const viewer = { userId: "user-1", sessionId: "sess-1" };
const user = { id: "user-1", role: "user" } as unknown as PlatformUser;
const input = { product_url: "https://www.amazon.com/dp/B0D1XD1ZV3", product_name: "AirPods", quantity: 1 };

function intake(rateLockId: string | null): OrderIntake {
  return {
    product_name: "AirPods", product_image_url: null, estimated_price_usd: 263.86, origin_country: "USA",
    pricing: { exchange_rate: 14.49, total_ghs: 4608.59, pricing_method: "flat_rate" } as OrderIntake["pricing"],
    needs_review: false, review_reasons: [], extraction_metadata: null, extraction_cache_id: CACHE_ID, rate_lock_id: rateLockId,
  };
}

function client(): SupabaseClient {
  const single = vi.fn(async () => ({ data: { id: "order-9", user_id: "user-1" }, error: null }));
  return { from: () => ({ insert: () => ({ select: () => ({ single }) }) }) } as unknown as SupabaseClient;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(consumeQuoteLocksForOrder).mockResolvedValue(["lock-1"]);
});

describe("createOrder — lock consumption", () => {
  it("consumes the viewer's locks on the extraction after the order row exists, with the charged rate", async () => {
    vi.mocked(buildOrderIntake).mockResolvedValue(intake("lock-1"));

    const order = await createOrder(client(), user, input, viewer);

    expect(buildOrderIntake).toHaveBeenCalledWith(input, viewer);
    expect(order.id).toBe("order-9");
    expect(consumeQuoteLocksForOrder).toHaveBeenCalledWith({
      viewer, extractionCacheId: CACHE_ID, lockId: "lock-1", orderId: "order-9", actorId: "user-1", exchangeRate: 14.49,
    });
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "order_created", metadata: expect.objectContaining({ rate_lock_id: "lock-1" }),
    }));
  });

  it("consumes nothing when the order was priced live", async () => {
    vi.mocked(buildOrderIntake).mockResolvedValue(intake(null));
    await createOrder(client(), user, input, viewer);
    expect(consumeQuoteLocksForOrder).not.toHaveBeenCalled();
  });

  it("does not fail the order when consumption hits a transient error", async () => {
    vi.mocked(buildOrderIntake).mockResolvedValue(intake("lock-1"));
    vi.mocked(consumeQuoteLocksForOrder).mockRejectedValue(new Error("Failed to consume quote lock: timeout"));
    await expect(createOrder(client(), user, input, viewer)).resolves.toMatchObject({ id: "order-9" });
  });

  it("surfaces a missing quote_locks table", async () => {
    vi.mocked(buildOrderIntake).mockResolvedValue(intake("lock-1"));
    vi.mocked(consumeQuoteLocksForOrder).mockRejectedValue(new Error("Could not find the table 'public.quote_locks'"));
    await expect(createOrder(client(), user, input, viewer)).rejects.toThrow(/quote_locks/);
  });
});
