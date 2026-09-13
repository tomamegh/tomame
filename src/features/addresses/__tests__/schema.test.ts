import { describe, it, expect } from "vitest";
import { addressIdSchema, createAddressSchema, updateAddressSchema } from "../schema";

const ZONE = "b4c99974-a1b4-4b49-ac8f-42dd0a0626d8";
const valid = {
  label: "Home", recipient_name: "Ama Mensah", phone: "0245550192", line1: "12 Boundary Rd",
  city: "Accra", delivery_zone_id: ZONE,
};

describe("createAddressSchema", () => {
  it("accepts Ghana phone numbers as customers type them", () => {
    for (const phone of ["0245550192", "024 555 0192", "+233 24 555 0192", "+233245550192"]) {
      expect(createAddressSchema.safeParse({ ...valid, phone }).success, phone).toBe(true);
    }
    for (const phone of ["", "024", "call me", "+233 24 555 0192 ext 4"]) {
      expect(createAddressSchema.safeParse({ ...valid, phone }).success, phone).toBe(false);
    }
  });

  it("accepts GhanaPost GPS and rejects anything else", () => {
    expect(createAddressSchema.safeParse({ ...valid, digital_address: "GA-183-4310" }).success).toBe(true);
    expect(createAddressSchema.safeParse({ ...valid, digital_address: "ga-1834-4310" }).success).toBe(true);
    expect(createAddressSchema.safeParse({ ...valid, digital_address: "GA1834310" }).success).toBe(false);
    expect(createAddressSchema.safeParse({ ...valid, digital_address: "GA-18-4310" }).success).toBe(false);
    expect(createAddressSchema.parse(valid).digital_address).toBeUndefined();
  });

  it("requires a zone uuid, trims, and defaults is_default to false", () => {
    const parsed = createAddressSchema.parse({ ...valid, label: "  Office  " });
    expect(parsed.label).toBe("Office");
    expect(parsed.is_default).toBe(false);
    expect(createAddressSchema.safeParse({ ...valid, delivery_zone_id: "accra" }).success).toBe(false);
    expect(createAddressSchema.safeParse({ ...valid, label: "" }).success).toBe(false);
  });
});

describe("updateAddressSchema", () => {
  it("requires something to change", () => {
    expect(updateAddressSchema.safeParse({}).success).toBe(false);
    expect(updateAddressSchema.safeParse({ is_default: true }).success).toBe(true);
    expect(updateAddressSchema.safeParse({ phone: "nope" }).success).toBe(false);
  });
});

describe("addressIdSchema", () => {
  it("is a uuid", () => {
    expect(addressIdSchema.safeParse(ZONE).success).toBe(true);
    expect(addressIdSchema.safeParse("1").success).toBe(false);
  });
});
