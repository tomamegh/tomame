import { describe, expect, it } from "vitest";

import { createAddressSchema, GHANA_PHONE_RE } from "@/features/addresses/schema";
import {
  accountPhoneSchema,
  notificationPreferencesSchema,
  updateAccountProfileSchema,
} from "../schema";

/**
 * The numbers the addresses schema documents as the shapes customers actually
 * type, plus the ones it must keep out. Both schemas are asserted against the
 * SAME list — that is the point of the test.
 */
const ACCEPTED = ["024 555 0192", "+233 24 555 0192", "0245550192", "030-276-0000", "+233-24-555-0192"];
const REJECTED = ["abc", "024", "call me", "+233-24-555-0192-extension-4", ""];

describe("the account phone rule is the address phone rule", () => {
  it("agrees with the exported regex on every sample, so a re-declared copy fails here", () => {
    for (const phone of [...ACCEPTED, ...REJECTED.filter((v) => v !== "")]) {
      expect({ phone, ok: accountPhoneSchema.safeParse(phone).success }).toEqual({
        phone,
        ok: GHANA_PHONE_RE.test(phone.trim()),
      });
    }
  });

  it.each(ACCEPTED)("accepts %s in both an address and an account", (phone) => {
    expect(accountPhoneSchema.safeParse(phone).success).toBe(true);

    const address = createAddressSchema.safeParse({
      label: "Home",
      recipient_name: "Ama",
      phone,
      line1: "12 Rd",
      city: "Accra",
      delivery_zone_id: "b4c99974-a1b4-4b49-ac8f-42dd0a0626d8",
    });
    expect(address.success).toBe(true);
  });

  it.each(REJECTED.filter((v) => v !== ""))(
    "rejects %s in both an address and an account",
    (phone) => {
      expect(accountPhoneSchema.safeParse(phone).success).toBe(false);

      const address = createAddressSchema.safeParse({
        label: "Home",
        recipient_name: "Ama",
        phone,
        line1: "12 Rd",
        city: "Accra",
        delivery_zone_id: "b4c99974-a1b4-4b49-ac8f-42dd0a0626d8",
      });
      expect(address.success).toBe(false);
    },
  );

  it("differs from an address in exactly one way: blank clears the account number", () => {
    // An address MUST have a phone — a courier calls it. An account phone is
    // optional, so emptying the field means "remove it", not "invalid".
    const cleared = accountPhoneSchema.safeParse("");
    expect(cleared.success).toBe(true);
    expect(cleared.success && cleared.data).toBeNull();

    const address = createAddressSchema.safeParse({
      label: "Home",
      recipient_name: "Ama",
      phone: "",
      line1: "12 Rd",
      city: "Accra",
      delivery_zone_id: "b4c99974-a1b4-4b49-ac8f-42dd0a0626d8",
    });
    expect(address.success).toBe(false);
  });

  it("trims before testing, so a pasted number with spaces around it is accepted", () => {
    const parsed = accountPhoneSchema.safeParse("  024 555 0192  ");
    expect(parsed.success && parsed.data).toBe("024 555 0192");
  });
});

describe("updateAccountProfileSchema", () => {
  it("accepts a patch of one field — the notification toggles send exactly that", () => {
    expect(updateAccountProfileSchema.safeParse({ notify_email: false }).success).toBe(true);
    expect(updateAccountProfileSchema.safeParse({ whatsapp_opt_in: true }).success).toBe(true);
  });

  it("refuses an empty patch rather than writing nothing and reporting success", () => {
    const parsed = updateAccountProfileSchema.safeParse({});
    expect(parsed.success).toBe(false);
    expect(parsed.success === false && parsed.error.issues[0]?.message).toBe("Nothing to update");
  });

  it("turns blank text into null so a cleared field is actually cleared", () => {
    const parsed = updateAccountProfileSchema.safeParse({ bio: "   ", first_name: "" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toEqual({ bio: null, first_name: null });
  });

  it("keeps the length limits the column has", () => {
    expect(updateAccountProfileSchema.safeParse({ bio: "x".repeat(501) }).success).toBe(false);
    expect(updateAccountProfileSchema.safeParse({ bio: "x".repeat(500) }).success).toBe(true);
    expect(updateAccountProfileSchema.safeParse({ first_name: "x".repeat(256) }).success).toBe(false);
  });

  it("rejects a bad phone with the account's own message", () => {
    const parsed = updateAccountProfileSchema.safeParse({ phone: "not a number" });
    expect(parsed.success).toBe(false);
    expect(parsed.success === false && parsed.error.issues[0]?.message).toMatch(/phone number/i);
  });

  it("will not take a role, however it is spelled — role is not an account field", () => {
    const parsed = updateAccountProfileSchema.safeParse({ bio: "hi", role: "admin" });
    expect(parsed.success).toBe(true);
    // zod strips unknown keys: the patch that reaches the database has no role
    // in it, so the column-level GRANT in 051 is a second line, not the only one.
    expect(parsed.success && parsed.data).not.toHaveProperty("role");
  });
});

describe("notificationPreferencesSchema", () => {
  it("takes the two booleans and nothing else", () => {
    expect(
      notificationPreferencesSchema.safeParse({ notify_email: true, whatsapp_opt_in: false }).success,
    ).toBe(true);
    expect(notificationPreferencesSchema.safeParse({ notify_email: "yes" }).success).toBe(false);
  });
});
