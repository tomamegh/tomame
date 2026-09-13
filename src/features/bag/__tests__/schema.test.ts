import { describe, it, expect } from "vitest";
import { addToBagSchema, updateBagLineSchema, checkoutSchema } from "../schema";

describe("addToBagSchema", () => {
  it("accepts identity, quantity, note and the two gap-fillers only", () => {
    const parsed = addToBagSchema.parse({ extraction_cache_id: "b4c99974-a1b4-4b49-ac8f-42dd0a0626d8", quantity: 2, origin_country: "USA", estimated_price_usd: 12.5 });
    expect(parsed.quantity).toBe(2);
    expect(addToBagSchema.safeParse({ extraction_cache_id: "nope" }).success).toBe(false);
    expect(addToBagSchema.safeParse({ extraction_cache_id: "b4c99974-a1b4-4b49-ac8f-42dd0a0626d8", quantity: 101 }).success).toBe(false);
    // No client price or rate is a field here — an unknown key is simply dropped.
    const stripped = addToBagSchema.parse({ extraction_cache_id: "b4c99974-a1b4-4b49-ac8f-42dd0a0626d8", total_ghs: 1, exchange_rate: 1 });
    expect(stripped).not.toHaveProperty("total_ghs");
  });
});

describe("updateBagLineSchema", () => {
  it("requires something to change", () => {
    expect(updateBagLineSchema.safeParse({}).success).toBe(false);
    expect(updateBagLineSchema.safeParse({ quantity: 3 }).success).toBe(true);
    expect(updateBagLineSchema.safeParse({ special_instructions: null }).success).toBe(true);
  });
});

describe("checkoutSchema", () => {
  it("accepts no choice or one choice, never both", () => {
    const a = "b4c99974-a1b4-4b49-ac8f-42dd0a0626d8";
    const z = "11111111-1111-4111-8111-111111111111";
    expect(checkoutSchema.safeParse({}).success).toBe(true);
    expect(checkoutSchema.safeParse({ delivery_address_id: a }).success).toBe(true);
    expect(checkoutSchema.safeParse({ delivery_zone_id: z }).success).toBe(true);
    expect(checkoutSchema.safeParse({ delivery_address_id: a, delivery_zone_id: z }).success).toBe(false);
  });
});
