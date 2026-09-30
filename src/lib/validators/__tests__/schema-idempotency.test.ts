import { describe, expect, it } from "vitest";
import type { z } from "zod";

import { notificationPreferencesSchema, updateAccountProfileSchema } from "@/features/account/schema";
import { createAddressSchema, updateAddressSchema } from "@/features/addresses/schema";
import { createAssistedRequestSchema } from "@/features/assisted/schema";
import { forgotPasswordSchema, loginSchema, resetPasswordSchema, signupSchema } from "@/features/auth/schema";
import { addToBagSchema } from "@/features/bag/schema";
import { contactSchema } from "@/features/contact/schema";
import { extractProductSchema } from "@/features/extraction/schema";
import { submitOrderFeedbackSchema } from "@/features/feedback/schema";
import { clientErrorReportSchema } from "@/features/ops/client-error-schema";
import { alertRecipientsSettingSchema } from "@/features/ops/alert-recipients";
import { updateOrderStatusSchema } from "@/features/orders/schema";
import { createUserSchema } from "@/features/users/schema";
import { webLinkSchema, withHttpsScheme } from "@/lib/validators/link";

/**
 * THE BUG CLASS (2026-09-30). A page validates with a schema, sends the PARSED
 * value, and the route parses it again. Any transform that changes a value's
 * type or shape ("" to null, a default, a trim, an added scheme) must be
 * accepted by the second pass, or the customer gets the route's refusal in a
 * toast for a form that looked valid. Every schema a page and a route share is
 * listed here with inputs that exercise its transforms; add yours.
 */
function expectIdempotent(schema: z.ZodType, input: unknown) {
  const once = schema.safeParse(input);
  expect(once.success, `first parse failed: ${once.success ? "" : once.error.issues[0]?.message}`).toBe(true);
  if (!once.success) return;
  const twice = schema.safeParse(JSON.parse(JSON.stringify(once.data)));
  expect(twice.success, `second parse of ${JSON.stringify(once.data)} failed: ${twice.success ? "" : twice.error.issues[0]?.message}`).toBe(true);
  if (twice.success) expect(twice.data).toEqual(once.data);
}

const ZONE = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const UUID = "8d6677b3-8b78-4ed5-a384-d4e5b80606d0";

const CASES: [string, z.ZodType, unknown[]][] = [
  [
    "account profile (the reported one)",
    updateAccountProfileSchema,
    [
      { first_name: "Ama", last_name: "", bio: "", phone: "" },
      { first_name: "  Ama  ", last_name: "Mensah", bio: "Hi", phone: "024 555 0192" },
      { bio: null, phone: null },
      { whatsapp_opt_in: true, notify_email: false },
    ],
  ],
  ["notification toggles", notificationPreferencesSchema, [{ notify_email: true, whatsapp_opt_in: false }]],
  [
    "new address",
    createAddressSchema,
    [
      { label: "Home", recipient_name: " Ama ", phone: "0245550192", line1: "12 Oxford St", city: "Accra", delivery_zone_id: ZONE },
      { label: "Work", recipient_name: "Kofi", phone: "+233 24 555 0192", line1: "1 Ring Rd", line2: "Flat 2", area: "Osu", region: "GA", city: "Accra", delivery_zone_id: ZONE, digital_address: "GA-183-4310", is_default: true },
    ],
  ],
  ["address patch", updateAddressSchema, [{ is_default: true }, { city: " Kumasi " }]],
  [
    "buy for me",
    createAssistedRequestSchema,
    [
      { extraction_request_id: UUID, description: "  The blue one, size 10  ", phone: "0245550192" },
      { product_url: "https://example.com/p/1", description: "A sentence or two about it", phone: "0245550192" },
    ],
  ],
  ["parcel feedback", submitOrderFeedbackSchema, [{ verdict: "looks_right" }, { verdict: "damaged", message: " Cracked ", photo_id: null }, { verdict: "other", message: "x", photo_id: UUID }]],
  ["paste a link", extractProductSchema, [{ product_url: "https://www.amazon.com/dp/B0X" }, { product_url: "amazon.com/dp/B0X" }, { product_url: "  ebay.com/itm/1  " }]],
  ["contact", contactSchema, [{ name: "Ama", email: "ama@example.com", subject: "Where is it", message: "My parcel has not moved" }]],
  ["sign up", signupSchema, [{ email: " Ama@Example.com ", password: "long-enough-1", confirmPassword: "long-enough-1" }]],
  ["log in", loginSchema, [{ email: "AMA@example.com", password: "x" }]],
  ["forgot password", forgotPasswordSchema, [{ email: " ama@example.com" }]],
  ["reset password", resetPasswordSchema, [{ password: "long-enough-1", confirmPassword: "long-enough-1" }]],
  ["add user (admin)", createUserSchema, [{ email: "New@Tomame.local", password: "long-enough-1", first_name: " Ama ", last_name: "Mensah", role: "warehouse" }]],
  ["add to bag", addToBagSchema, [{ extraction_cache_id: UUID }, { extraction_request_id: UUID, quantity: 2, special_instructions: " red " }]],
  ["order status (admin)", updateOrderStatusSchema, [{ status: "in_transit", tracking_url: "ups.com/track?x=1" }, { status: "delivered" }]],
  ["client error report", clientErrorReportSchema, [{ kind: "api_4xx", message: " Invalid input ", api: "/api/app/me", method: "PATCH", status: 400, page: "/app/account" }]],
  ["alert recipients setting", alertRecipientsSettingSchema, [[" Ops@Example.com ", "kelanimdev@gmail.com"]]],
];

describe("schemas a page and its route both parse survive being parsed twice", () => {
  for (const [name, schema, inputs] of CASES) {
    it(name, () => {
      for (const input of inputs) expectIdempotent(schema, input);
    });
  }
});

describe("regressions found by the audit", () => {
  it("a blank 'About you' reaches the route as null, and the route accepts it", () => {
    const sent = updateAccountProfileSchema.parse({ first_name: "Ama", last_name: "Mensah", bio: "", phone: "" });
    expect(sent).toMatchObject({ bio: null, phone: null });
    expect(updateAccountProfileSchema.safeParse(sent).success).toBe(true);
  });

  it("a link without https:// is a link (paste box, hero bar, tracking url)", () => {
    expect(extractProductSchema.parse({ product_url: "amazon.com/dp/B0X" }).product_url).toBe("https://amazon.com/dp/B0X");
    expect(updateOrderStatusSchema.parse({ status: "in_transit", tracking_url: "ups.com/track?x=1" }).tracking_url).toBe("https://ups.com/track?x=1");
    expect(withHttpsScheme("http://a.com")).toBe("http://a.com");
  });

  it("text that is not a link is still refused", () => {
    expect(webLinkSchema("bad").safeParse("wireless earbuds").success).toBe(false);
    expect(webLinkSchema("bad").safeParse("").success).toBe(false);
  });

  it("the Add user form refuses a blank name before the route does", () => {
    expect(createUserSchema.safeParse({ email: "a@b.co", password: "long-enough-1", first_name: "  ", last_name: "M", role: "user" }).success).toBe(false);
    expect(createUserSchema.safeParse({ email: "a@b.co", password: "long-enough-1", first_name: "A", last_name: "M", role: "superuser" }).success).toBe(false);
  });

  it("bag instructions are capped where the route caps them", () => {
    expect(addToBagSchema.safeParse({ extraction_cache_id: UUID, special_instructions: "x".repeat(1000) }).success).toBe(true);
    expect(addToBagSchema.safeParse({ extraction_cache_id: UUID, special_instructions: "x".repeat(1001) }).success).toBe(false);
  });
});
