import { describe, it, expect } from "vitest";

import {
  createSourcingRequestSchema,
  sourcingContactNameSchema,
  sourcingContactPhoneSchema,
} from "../schema";
import { profileFullName, profilePhoneForField } from "../components/sourcing-contact-dialog";

const CACHE_ID = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";

describe("sourcingContactPhoneSchema (097)", () => {
  it.each([
    "0244123456",
    "024 412 3456",
    "024-412-3456",
    "+233244123456",
    "+233 24 412 3456",
    "233244123456",
    "233 24 412 3456",
    "00233244123456",
    "+233 0244123456", // the kept-trunk slip
    "  0244123456  ",
  ])("normalises %j to +233244123456", (raw) => {
    expect(sourcingContactPhoneSchema.parse(raw)).toBe("+233244123456");
  });

  it("parses its own output to itself (the form sends the parsed value, the route parses again)", () => {
    const once = sourcingContactPhoneSchema.parse("024 412 3456");
    expect(sourcingContactPhoneSchema.parse(once)).toBe(once);
  });

  it.each([null, undefined, "", "   "])("asks for a number on %j instead of a type error", (raw) => {
    const out = sourcingContactPhoneSchema.safeParse(raw);
    expect(out.success).toBe(false);
    expect(out.error?.issues[0]?.message).toBe("Enter a phone number we can reach you on");
  });

  it.each(["12345", "024412345", "02441234567", "0044123456", "+44 7700 900123", "phone me", "+233 024412345"])(
    "rejects %j with a message that shows the format",
    (raw) => {
      const out = sourcingContactPhoneSchema.safeParse(raw);
      expect(out.success).toBe(false);
      expect(out.error?.issues[0]?.message).toMatch(/Ghana number.*024 412 3456/);
    },
  );
});

describe("sourcingContactNameSchema (097)", () => {
  it("trims and collapses inner whitespace", () => {
    expect(sourcingContactNameSchema.parse("  Kwame   Mensah ")).toBe("Kwame Mensah");
  });

  it.each([null, undefined, "", "  "])("asks for a name on %j instead of a type error", (raw) => {
    const out = sourcingContactNameSchema.safeParse(raw);
    expect(out.success).toBe(false);
    expect(out.error?.issues[0]?.message).toBe("Tell us your name");
  });

  it("caps the length", () => {
    expect(sourcingContactNameSchema.safeParse("a".repeat(121)).success).toBe(false);
  });
});

describe("createSourcingRequestSchema", () => {
  it("requires contact details on a new request", () => {
    const out = createSourcingRequestSchema.safeParse({ extraction_cache_id: CACHE_ID });
    expect(out.success).toBe(false);
    expect(out.error?.issues.map((i) => i.path[0])).toEqual(["contact_name", "contact_phone"]);
  });

  it("hands the service the normalised values", () => {
    expect(
      createSourcingRequestSchema.parse({
        extraction_cache_id: CACHE_ID,
        contact_name: " Kwame Mensah ",
        contact_phone: "024 412 3456",
      }),
    ).toMatchObject({ contact_name: "Kwame Mensah", contact_phone: "+233244123456", quantity: 1 });
  });
});

describe("profile prefill", () => {
  it("joins whichever halves of the name exist", () => {
    expect(profileFullName({ first_name: "Kwame", last_name: "Mensah" })).toBe("Kwame Mensah");
    expect(profileFullName({ first_name: "Kwame", last_name: null })).toBe("Kwame");
    expect(profileFullName({ first_name: null, last_name: null })).toBe("");
    expect(profileFullName(undefined)).toBe("");
  });

  it("shows a stored phone readably, an odd one as typed, and null as empty", () => {
    expect(profilePhoneForField("0244123456")).toBe("+233 24 412 3456");
    expect(profilePhoneForField("+44 7700 900123")).toBe("+44 7700 900123");
    expect(profilePhoneForField(null)).toBe("");
    expect(profilePhoneForField(undefined)).toBe("");
  });
});
