import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "PAYSTACK_SECRET_KEY", "NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY", "RESEND_API_KEY", "RESEND_FROM_EMAIL", "NEXT_PUBLIC_APP_URL", "BROWSERLESS_API_KEY", "ANTHROPIC_API_KEY", "EXCHANGE_RATE_API_KEY", "CRON_SECRET"]) {
    process.env[k] ??= k.includes("URL") ? "https://tomame.test" : "test";
  }
});

const m = vi.hoisted(() => ({
  findUserIdByEmail: vi.fn(),
  createPasswordlessAccount: vi.fn(),
  getCustomerProfile: vi.fn(),
  updateCustomerProfile: vi.fn(),
  getAuthUser: vi.fn(),
  addToBag: vi.fn(),
  findOpenSessionCart: vi.fn(),
  findOpenCart: vi.fn(),
  setCartStatus: vi.fn(),
  adoptCart: vi.fn(),
  checkoutBag: vi.fn(),
  recordOfflineGroupPayment: vi.fn(),
  logAuditEvent: vi.fn(),
  sendEmail: vi.fn(),
  listOrdersByGroup: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/db/queries/announcements", () => ({ findUserIdByEmail: m.findUserIdByEmail }));
vi.mock("@/db/queries/customer-accounts", () => ({
  createPasswordlessAccount: m.createPasswordlessAccount,
  getCustomerProfile: m.getCustomerProfile,
  updateCustomerProfile: m.updateCustomerProfile,
  getAuthUser: m.getAuthUser,
}));
vi.mock("@/db/queries/carts", () => ({
  findOpenSessionCart: m.findOpenSessionCart,
  findOpenCart: m.findOpenCart,
  setCartStatus: m.setCartStatus,
  adoptCart: m.adoptCart,
}));
vi.mock("@/db/queries/delivery-addresses", () => ({ getDeliveryAddressById: vi.fn(), insertDeliveryAddress: vi.fn(), listDeliveryAddresses: vi.fn(async () => []) }));
vi.mock("@/db/queries/delivery-zones", () => ({ listActiveDeliveryZones: vi.fn(async () => []) }));
vi.mock("@/db/queries/extraction-cache", () => ({ getValidExtractionById: vi.fn(), upsertExtractionCache: vi.fn() }));
vi.mock("@/features/bag/services/bag.service", () => ({ addToBag: m.addToBag, previewBatch: vi.fn() }));
vi.mock("@/features/bag/services/checkout.service", () => ({ checkoutBag: m.checkoutBag }));
vi.mock("@/features/payments/services/payments.service", () => ({ recordOfflineGroupPayment: m.recordOfflineGroupPayment }));
vi.mock("@/features/payments/services/payment-reconciliation.service", () => ({ resolvePaymentTimeouts: async () => ({ unpaidOrderTtlHours: 12 }) }));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: m.logAuditEvent }));
vi.mock("@/features/extraction/extraction.service", () => ({ extractPrepared: vi.fn(), prepareProductUrl: vi.fn() }));
vi.mock("@/lib/email/transport", () => ({ sendEmail: m.sendEmail }));
vi.mock("@/lib/email/notify-preference", () => ({ mayEmailUser: async () => true }));
vi.mock("@/db/queries/orders", () => ({ listOrdersByGroup: m.listOrdersByGroup }));
vi.mock("@/features/assisted/services/manual-quote.service", () => ({ staffPricedResult: vi.fn() }));

import { placeAssistedOrder, whatsappHref } from "../services/assisted-order.service";
import { placeAssistedOrderSchema } from "../schema";
import type { PlatformUser } from "@/features/users/types";

const admin = { id: "admin-1", email: "staff@tomame.test" } as PlatformUser;
const CUSTOMER = "11111111-1111-4111-8111-111111111111";
const input = placeAssistedOrderSchema.parse({
  customer: { email: "Ama@Example.com ", first_name: "Ama", last_name: "Owusu", phone: "024 412 3456" },
  lines: [{ extraction_cache_id: "22222222-2222-4222-8222-222222222222", quantity: 2, chosen_options: { Size: "M" } }],
  delivery: { kind: "pickup", delivery_zone_id: "33333333-3333-4333-8333-333333333333" },
  payment: { mode: "offline", method: "momo", reference: "MP123" },
});

beforeEach(() => {
  vi.clearAllMocks();
  m.findUserIdByEmail.mockResolvedValue(null);
  m.createPasswordlessAccount.mockResolvedValue({ user: { id: CUSTOMER }, taken: false, error: null });
  m.getCustomerProfile.mockResolvedValue({ id: CUSTOMER, role: "user", first_name: null, last_name: null, phone: null, created_at: "2026-11-27T00:00:00Z", updated_at: "2026-11-27T00:00:00Z" });
  m.getAuthUser.mockResolvedValue({ id: CUSTOMER, email: "ama@example.com" });
  m.findOpenSessionCart.mockResolvedValue({ id: "draft-cart" });
  m.findOpenCart.mockResolvedValue({ id: "own-cart" });
  m.setCartStatus.mockResolvedValue(true);
  m.adoptCart.mockResolvedValue(true);
  m.checkoutBag.mockResolvedValue({ order_group_id: "group-1", order_ids: ["o1"], total_ghs: 500, total_pesewas: 50000, item_count: 2, status: "pending" });
  m.recordOfflineGroupPayment.mockResolvedValue({ payment: { reference: "TOM_1" }, settled: 1 });
  m.listOrdersByGroup.mockResolvedValue([{ product_name: "Pleated dress", quantity: 2, chosen_options: { Size: "M" } }]);
  m.sendEmail.mockResolvedValue(undefined);
});

describe("placeAssistedOrder", () => {
  it("makes the account, fills the profile, checks out a bag of its own and records the payment", async () => {
    const placed = await placeAssistedOrder(admin, input);

    expect(m.createPasswordlessAccount).toHaveBeenCalledWith("ama@example.com", { first_name: "Ama", last_name: "Owusu" });
    expect(m.updateCustomerProfile).toHaveBeenCalledWith(CUSTOMER, { first_name: "Ama", last_name: "Owusu", phone: "+233244123456" });
    const [draftViewer, line] = m.addToBag.mock.calls[0]!;
    expect(draftViewer.userId).toBeNull();
    expect(line).toMatchObject({ quantity: 2, chosen_options: { Size: "M" } });
    expect(m.adoptCart).toHaveBeenCalledWith("draft-cart", CUSTOMER);
    expect(m.checkoutBag.mock.calls[0]![2]).toMatchObject({ delivery_zone_id: "33333333-3333-4333-8333-333333333333" });
    expect(m.recordOfflineGroupPayment).toHaveBeenCalledWith("admin-1", "group-1", { mode: "offline", method: "momo", reference: "MP123" });
    expect(placed).toMatchObject({ customer_id: CUSTOMER, account_created: true, status: "paid", order_group_id: "group-1", payment_reference: "TOM_1" });
    expect(placed.whatsapp_href).toContain("https://wa.me/233244123456?text=");
    expect(placed.emailed_to).toBe("ama@example.com");
    const mail = m.sendEmail.mock.calls[0]![0];
    expect(mail.to).toBe("ama@example.com");
    expect(mail.html).toContain("Pleated dress");
    expect(mail.html).toContain("Size: M");
    expect(mail.html).toContain("/auth/login?next=%2Fapp%2Forders");
    expect(mail.text).toContain("no password");
  });

  it("still places the order when the email cannot be sent, and says so", async () => {
    m.sendEmail.mockRejectedValue(new Error("Resend down"));
    const placed = await placeAssistedOrder(admin, input);
    expect(placed.order_group_id).toBe("group-1");
    expect(placed.emailed_to).toBeNull();
  });

  it("sets the customer's own bag aside and puts it back, even when checkout refuses", async () => {
    m.checkoutBag.mockRejectedValue(new Error("Choose the size"));
    await expect(placeAssistedOrder(admin, input)).rejects.toThrow("Choose the size");

    expect(m.setCartStatus.mock.calls).toEqual([
      ["own-cart", "open", "abandoned"],
      ["draft-cart", "open", "abandoned"],
      ["own-cart", "abandoned", "open"],
    ]);
    expect(m.recordOfflineGroupPayment).not.toHaveBeenCalled();
  });

  it("never overwrites what an existing customer set, and refuses a staff account", async () => {
    m.findUserIdByEmail.mockResolvedValue(CUSTOMER);
    m.getCustomerProfile.mockResolvedValue({ id: CUSTOMER, role: "user", first_name: "Ama", last_name: "Boateng", phone: "+233201112222", created_at: "x", updated_at: "x" });
    await placeAssistedOrder(admin, input);
    expect(m.createPasswordlessAccount).not.toHaveBeenCalled();
    expect(m.updateCustomerProfile).not.toHaveBeenCalled();

    m.getCustomerProfile.mockResolvedValue({ id: CUSTOMER, role: "admin", first_name: "A", last_name: "B", phone: "+233201112222", created_at: "x", updated_at: "x" });
    await expect(placeAssistedOrder(admin, input)).rejects.toThrow(/staff account/);
  });
});

describe("placeAssistedOrder, customer pays online", () => {
  it("records no payment and emails a link that signs them in to the order's Pay button", async () => {
    const placed = await placeAssistedOrder(admin, { ...input, payment: { mode: "pay_link" } });

    expect(m.recordOfflineGroupPayment).not.toHaveBeenCalled();
    expect(placed).toMatchObject({ status: "awaiting_payment", payment_reference: null, emailed_to: "ama@example.com" });
    const mail = m.sendEmail.mock.calls[0]![0];
    expect(mail.subject).toBe("Your Tomame order is ready to pay");
    expect(mail.html).toContain("/auth/login?next=%2Fapp%2Forders%2Fo1");
    expect(mail.html).toContain("Sign in and pay");
    expect(mail.html).toContain("Size: M");
    expect(mail.text).toContain("12 hours");
    expect(decodeURIComponent(placed.whatsapp_href!)).toContain("to pay by MoMo or card");
  });
});

describe("whatsappHref", () => {
  it("is null without a usable number", () => {
    const base = { firstName: "Ama", totalGhs: 10, email: "a@b.c", paid: true, next: "/app/orders" };
    expect(whatsappHref({ ...base, phone: null })).toBeNull();
    expect(whatsappHref({ ...base, phone: "12" })).toBeNull();
  });
});
