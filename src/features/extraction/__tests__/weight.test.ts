import { describe, it, expect } from "vitest";
import { cleanSpecValue, dimensionsFromSpecs, parseWeightLbs, unitOf, weightFromSpecs, weightInDimensions } from "../weight";

const LRM = "\u200E";

describe("parseWeightLbs", () => {
  it("converts every unit to pounds", () => {
    expect(parseWeightLbs("1.49 pounds")).toBe(1.49);
    expect(parseWeightLbs("5 lbs")).toBe(5);
    expect(parseWeightLbs("1 lb.")).toBe(1);
    expect(parseWeightLbs("12 oz")).toBe(0.75);
    expect(parseWeightLbs("13.76 ounces")).toBe(0.86);
    expect(parseWeightLbs("500 g")).toBe(1.1);
    expect(parseWeightLbs("500g")).toBe(1.1);
    expect(parseWeightLbs("540 grams")).toBe(1.19);
    expect(parseWeightLbs("1.2 kg")).toBe(2.65);
    expect(parseWeightLbs("0.26 Kilograms")).toBe(0.57);
    expect(parseWeightLbs("1,2 kg")).toBe(2.65); // decimal comma
  });

  it("sums a compound pounds + ounces weight", () => {
    expect(parseWeightLbs("2 lbs 4 oz")).toBe(2.25);
    expect(parseWeightLbs("2 lb, 8 oz")).toBe(2.5);
  });

  it("never assumes pounds for a bare number", () => {
    expect(parseWeightLbs("4")).toBeNull(); // eBay 298105190066 "Item Weight": "4"
    expect(parseWeightLbs("4", "lb")).toBe(4);
    expect(parseWeightLbs("12", "oz")).toBe(0.75);
    expect(parseWeightLbs("heavy")).toBeNull();
    expect(parseWeightLbs("0 lbs")).toBeNull();
    expect(parseWeightLbs(null)).toBeNull();
  });

  it("keeps sub-pound items above zero and ignores GB / GHz", () => {
    expect(parseWeightLbs("0.18 ounces")).toBe(0.01);
    expect(parseWeightLbs("32 GB")).toBeNull();
    expect(parseWeightLbs("2.4 GHz")).toBeNull();
  });

  it("strips U+200E and reads the weight out of an Amazon dimensions string", () => {
    expect(parseWeightLbs(`${LRM}13 x 8 x 1 inches; 1.49 pounds`)).toBe(1.49);
    expect(weightInDimensions(`${LRM}13 x 8 x 1 inches; 1.49 pounds`)).toBe("1.49 pounds");
    expect(weightInDimensions("3.07 x 8.11 x 7.24 inches; 5.93 ounces")).toBe("5.93 ounces");
    expect(weightInDimensions("13 x 8 x 1 inches")).toBeNull();
    expect(cleanSpecValue(`${LRM}B096KSH2CB`)).toBe("B096KSH2CB");
  });

  it("reads unit words", () => {
    expect(unitOf("LBR")).toBe("lb");
    expect(unitOf("GRM")).toBe("g");
    expect(unitOf("Ounces")).toBe("oz");
    expect(unitOf("inches")).toBeNull();
  });
});

describe("weightFromSpecs", () => {
  it("leaves a unitless eBay weight as text with no pounds", () => {
    expect(weightFromSpecs({ "Item Weight": "4", "Item Length": "18" })).toEqual({ text: "4", lbs: null });
  });

  it("uses a sibling unit spec or a unit in the key", () => {
    expect(weightFromSpecs({ "Item Weight": "4", "Weight Unit": "lbs" })).toEqual({ text: "4", lbs: 4 });
    expect(weightFromSpecs({ "Item Weight": "500", "Unit of Weight": "g" }).lbs).toBe(1.1);
    expect(weightFromSpecs({ "Item Weight (oz)": "12" }).lbs).toBe(0.75);
  });

  it("parses seller-written units", () => {
    expect(weightFromSpecs({ "Item Weight": "12 oz" }).lbs).toBe(0.75);
    expect(weightFromSpecs({ "Item Weight": "500 g" }).lbs).toBe(1.1);
    expect(weightFromSpecs({ "Item Weight": "2 lbs 4 oz" }).lbs).toBe(2.25);
  });

  it("prefers item weight over shipping weight", () => {
    expect(weightFromSpecs({ "Shipping Weight": "3 pounds", "Item Weight": "1 pounds" }).lbs).toBe(1);
  });

  it("falls back to the tail of a dimensions spec", () => {
    expect(weightFromSpecs({ "Product Dimensions": `${LRM}13 x 8 x 1 inches; 1.49 pounds` })).toEqual({ text: "1.49 pounds", lbs: 1.49 });
  });
});

describe("dimensionsFromSpecs", () => {
  it("combines separate L / W / H specs (eBay MacBook 298105190066)", () => {
    expect(dimensionsFromSpecs({ "Item Width": "14", "Item Height": "3", "Item Length": "18", "Screen Size": '16"' })).toBe("18 x 14 x 3");
  });

  it("keeps a stated unit", () => {
    expect(dimensionsFromSpecs({ "Item Length": "18 in", "Item Width": "14 in", "Item Height": "3 in" })).toBe("18 x 14 x 3 in");
    expect(dimensionsFromSpecs({ "Item Length": "18", "Item Width": "14", "Item Height": "3", "Unit of Length": "cm" })).toBe("18 x 14 x 3 cm");
  });

  it("prefers an explicit dimensions spec and never returns a lone number", () => {
    expect(dimensionsFromSpecs({ "Item Height": "3", "Item Dimensions": "18 x 14 x 3 inches" })).toBe("18 x 14 x 3 inches");
    expect(dimensionsFromSpecs({ "Item Height": "3" })).toBeNull();
    expect(dimensionsFromSpecs({ "Sleeve Length": "Long", "Heel Height": "2 in", "Width": "M" })).toBeNull();
  });
});
