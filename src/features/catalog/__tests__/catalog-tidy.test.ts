import { describe, expect, it } from "vitest";

import { departmentFor, displayTitle, pickKeeper, titleKey } from "../catalog-tidy";

describe("displayTitle", () => {
  it("strips Global Recycled Standard, repeated and cut off", () => {
    expect(displayTitle("Dell XPS 14 Premium Laptop 14.5\" 3.2K OLED Touch, Ultra 7 255H, 16GB/2TB Global Recycled Standard Global Recycled Standa")).toBe(
      "Dell XPS 14 Premium Laptop 14.5\" 3.2K OLED Touch, Ultra 7 255H, 16GB/2TB",
    );
    expect(displayTitle("Laptop Stand for Desk, Adjustable Laptop Riser, Black Global Recycled Standard Global Recycled Standard Global Recycled ")).toBe(
      "Laptop Stand for Desk, Adjustable Laptop Riser, Black",
    );
    expect(displayTitle("Red Light Therapy for Wrist and Hand, Cordless Wrap with Heat & Vibration Global")).toBe(
      "Red Light Therapy for Wrist and Hand, Cordless Wrap with Heat & Vibration",
    );
  });

  it("leaves a title alone when the words are part of the product", () => {
    expect(displayTitle("Global Recycled Standard Certified Tote Bag")).toBe("Global Recycled Standard Certified Tote Bag");
    expect(displayTitle("  Crocs   Classic Clogs  ")).toBe("Crocs Classic Clogs");
    expect(displayTitle(null)).toBe("");
  });
});

describe("titleKey", () => {
  it("makes size and colour listings of one product the same key", () => {
    expect(titleKey("Crocs Classic Clogs - Glitter")).toBe(titleKey("Crocs Classic Clogs – Glitter "));
    expect(titleKey("Crocs Kid's Classic Clog (Little Kid/Big Kid/Toddler)")).toBe("crocs kid s classic clog little kid big kid toddler");
    expect(titleKey("Tide PODS Laundry Detergent Global Recycled Standard")).toBe(titleKey("Tide PODS Laundry Detergent"));
  });
});

describe("departmentFor", () => {
  it("re-files the brief's examples", () => {
    expect(departmentFor("Polo Ralph Lauren Men's Classic-Fit Striped Polo Shirt", "Women's Clothing")).toBe("Men's Clothing");
    expect(departmentFor("adidas Men's Lite Racer Adapt 7.0 Running Shoes", "Women's Shoes")).toBe("Men's Shoes");
    expect(departmentFor("FREETOO Carpal Tunnel Wrist Brace Night Support, Left Hand, Medium", "Baby")).toBe("Health & Household");
    expect(departmentFor("Outroad 32 Inch Fire Pit, Outdoor Wood Burning Fire Pit for Patio", "Cycling")).toBe("Home & Kitchen");
    expect(departmentFor("Dove Exfoliating Body Scrub with Crushed Macadamia", "Musical Instruments")).toBe("Skin Care");
    expect(departmentFor("Best Choice Products 1500W Electric Space Heater", "Musical Instruments")).toBe("Appliances");
  });

  it("keeps what belongs", () => {
    expect(departmentFor("Fender CD-60S Dreadnought Acoustic Guitar", "Musical Instruments")).toBe("Musical Instruments");
    expect(departmentFor("Graco Modes Pramette Travel System Baby Stroller", "Baby")).toBe("Baby");
    expect(departmentFor("Women's Wrap Midi Dress", "Women's Clothing")).toBe("Women's Clothing");
    expect(departmentFor("Crocs Unisex Adult Classic Clog", "Men's Shoes")).toBe("Men's Shoes");
    expect(departmentFor("Samsung 55-inch Crystal UHD TV", "TV & Video")).toBe("TV & Video");
    // Found on prod in the dry run: a midi dress is not a MIDI keyboard; a travel system is a stroller.
    expect(departmentFor("Women's Pleated Waist Midi Shirtdress with Short Sleeves", "Women's Clothing")).toBe("Women's Clothing");
    expect(departmentFor("Off-Shoulder White Floral Sheath Midi Size Medium", "Women's Clothing")).toBe("Women's Clothing");
    expect(departmentFor("Evenflo Pivot Modular Travel System, Casual Gray", "Baby")).toBe("Baby");
    expect(departmentFor("Akai MPK Mini MIDI Keyboard Controller", "Musical Instruments")).toBe("Musical Instruments");
  });

  it("files a guarded department's strays under Other, and never moves clothing on a stray word", () => {
    expect(departmentFor("Stainless Steel Water Bottle 32oz", "Cycling")).toBe("Other");
    expect(departmentFor("Women's Toddler Print T-Shirt", "Women's Clothing")).toBe("Women's Clothing");
    expect(departmentFor("Unbranded Fashion Shoulder Bag for Women", "Women's Clothing")).toBe("Handbags & Wallets");
    expect(departmentFor("Anything", null)).toBeNull();
  });
});

describe("pickKeeper", () => {
  it("keeps the priced, most recently seen, lowest-priced listing and says why", () => {
    const rows = [
      { id: "a", price_usd: 54.99, landed_ghs: 900, last_seen_at: "2026-11-20T10:00:00Z" },
      { id: "b", price_usd: 33, landed_ghs: 600, last_seen_at: "2026-11-20T09:00:00Z" },
      { id: "c", price_usd: 20, landed_ghs: null, last_seen_at: "2026-11-21T09:00:00Z" },
      { id: "d", price_usd: 19, landed_ghs: 500, last_seen_at: "2026-11-01T09:00:00Z" },
    ];
    const { keep, drop, note } = pickKeeper(rows, "Amazon");
    expect(keep.id).toBe("b");
    expect(drop.map((r) => r.id).sort()).toEqual(["a", "c", "d"]);
    expect(note).toBe("Kept over 3 other listings of this product at Amazon ($19.00–$54.99): the priced, most recently seen (2026-11-20) at the lowest price that day, $33.00.");
  });
});
