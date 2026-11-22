import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { app: { url: "https://tomame.test" } } }));
const getUserById = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { getUserById } } }),
}));
vi.mock("@/lib/email/transport", () => ({ sendEmail: vi.fn(async () => undefined) }));
vi.mock("@/lib/email/notify-preference", () => ({ mayEmailUser: vi.fn(async () => true) }));
vi.mock("@/features/notifications/services/whatsapp.service", () => ({ queueWhatsApp: vi.fn(async () => undefined) }));
vi.mock("@/features/staff-alerts/notify", () => ({ notifyStaff: vi.fn() }));
vi.mock("@/db/queries/orders", () => ({ listOrdersByGroup: vi.fn(async () => [{ id: "o-1" }, { id: "o-2" }]) }));
vi.mock("@/db/queries/notifications", () => ({
  markOrderPlacedDelivery: vi.fn(async () => 1),
  listOrderPlacedRetries: vi.fn(async () => []),
}));

import { markOrderPlacedDelivery } from "@/db/queries/notifications";
import { sendEmail } from "@/lib/email/transport";
import { mayEmailUser } from "@/lib/email/notify-preference";
import { sendOrderStatusEmail } from "../services/orders.service";
import type { Order } from "../types";

const order = (over: Partial<Order> = {}) =>
  ({ id: "o-1", order_no: "TM-00040", product_name: "Headphones", order_group_id: null, pricing: { total_ghs: 100 }, ...over }) as unknown as Order;

beforeEach(() => {
  vi.clearAllMocks();
  getUserById.mockResolvedValue({ data: { user: { email: "ama@example.com" } }, error: null });
});

describe("the order-placed row records the paid message (Fix 13)", () => {
  it("marks it sent once the email is accepted", async () => {
    await sendOrderStatusEmail("u-1", order({ order_group_id: "g-1" }), "paid");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(markOrderPlacedDelivery).toHaveBeenCalledWith("u-1", ["o-1", "o-2"], { status: "sent" });
  });

  it("records a single order on its own row", async () => {
    vi.mocked(mayEmailUser).mockResolvedValueOnce(false);
    await sendOrderStatusEmail("u-1", order(), "paid");
    expect(markOrderPlacedDelivery).toHaveBeenCalledWith("u-1", ["o-1"], { status: "sent" });
  });

  it("marks it failed, with the reason, when the email is refused", async () => {
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("Resend 422"));
    await sendOrderStatusEmail("u-1", order({ order_group_id: "g-1" }), "paid");
    expect(markOrderPlacedDelivery).toHaveBeenCalledWith("u-1", ["o-1", "o-2"], { status: "failed", reason: "Resend 422" });
  });

  it("counts the bell as the delivery when the customer turned email off", async () => {
    vi.mocked(mayEmailUser).mockResolvedValueOnce(false);
    await sendOrderStatusEmail("u-1", order(), "paid");
    expect(sendEmail).not.toHaveBeenCalled();
    expect(markOrderPlacedDelivery).toHaveBeenCalledWith("u-1", ["o-1"], { status: "sent" });
  });

  it("leaves other statuses' rows alone", async () => {
    await sendOrderStatusEmail("u-1", order(), "in_transit");
    expect(markOrderPlacedDelivery).not.toHaveBeenCalled();
  });
});
