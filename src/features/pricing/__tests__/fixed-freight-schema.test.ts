import { describe, expect, it } from "vitest";

import {
  createFixedFreightItemSchema,
  testFixedFreightTitleSchema,
  updateFixedFreightItemSchema,
} from "../schema";

const valid = {
  category: "  iphone ",
  product_name: "  iPhone 13 & Mini ",
  freight_rate_ghs: 500,
  keywords: [" iPhone 13 ", "iphone 13", "IPHONE   13 MINI", ""],
};

describe("createFixedFreightItemSchema", () => {
  it("trims and upper-cases the shelf, trims the name, normalises and de-duplicates keywords", () => {
    const out = createFixedFreightItemSchema.parse(valid);
    expect(out).toEqual({
      category: "IPHONE",
      product_name: "iPhone 13 & Mini",
      freight_rate_ghs: 500,
      keywords: ["iphone 13", "iphone 13 mini"],
      sort_order: 0,
      is_active: true,
    });
  });

  it("keeps an ampersand shelf name intact", () => {
    expect(
      createFixedFreightItemSchema.parse({
        ...valid,
        category: "mac  & laptops",
      }).category,
    ).toBe("MAC & LAPTOPS");
  });

  it("rejects a zero, negative, absurd or non-numeric rate", () => {
    for (const freight_rate_ghs of [0, -5, 1_000_000, "500", Number.NaN]) {
      expect(
        createFixedFreightItemSchema.safeParse({ ...valid, freight_rate_ghs })
          .success,
      ).toBe(false);
    }
  });

  it("rejects a blank name, a blank shelf and an all-blank keyword list", () => {
    expect(
      createFixedFreightItemSchema.safeParse({ ...valid, product_name: "   " })
        .success,
    ).toBe(false);
    expect(
      createFixedFreightItemSchema.safeParse({ ...valid, category: " " })
        .success,
    ).toBe(false);
    const r = createFixedFreightItemSchema.safeParse({
      ...valid,
      keywords: [" ", ""],
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(
      "At least one keyword is required",
    );
  });

  it("rejects a fractional or negative sort order", () => {
    expect(
      createFixedFreightItemSchema.safeParse({ ...valid, sort_order: 1.5 })
        .success,
    ).toBe(false);
    expect(
      createFixedFreightItemSchema.safeParse({ ...valid, sort_order: -1 })
        .success,
    ).toBe(false);
  });
});

describe("updateFixedFreightItemSchema", () => {
  it("is partial and normalises what it is given", () => {
    expect(
      updateFixedFreightItemSchema.parse({ freight_rate_ghs: 650 }),
    ).toEqual({ freight_rate_ghs: 650 });
    expect(
      updateFixedFreightItemSchema.parse({ keywords: ["A", "a "] }),
    ).toEqual({ keywords: ["a"] });
  });

  it("rejects an empty patch and unknown fields", () => {
    expect(updateFixedFreightItemSchema.safeParse({}).success).toBe(false);
    expect(
      updateFixedFreightItemSchema.safeParse({ id: "x", freight_rate_ghs: 1 })
        .success,
    ).toBe(false);
  });
});

describe("testFixedFreightTitleSchema", () => {
  it("treats a blank category as none", () => {
    expect(
      testFixedFreightTitleSchema.parse({ title: " iPhone 13 ", category: "" }),
    ).toEqual({
      title: "iPhone 13",
      category: null,
    });
  });
});
