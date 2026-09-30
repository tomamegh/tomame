import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  departmentImage,
  departmentImageKey,
  departmentSlug,
} from "../components/department-images";

const PUBLIC_DIR = join(__dirname, "../../../../public");

// The labels `catalog_categories()` returned when the photos were shot.
const SHOT_LABELS = [
  "Cell Phones & Accessories",
  "Computers",
  "Video Games",
  "Kitchen & Dining",
  "Headphones",
  "Smart Home",
  "Handbags & Wallets",
  "Luggage & Travel Gear",
  "Toys & Games",
  "Beauty & Personal Care",
  "Electronics",
  "Appliances",
  "Home & Kitchen",
  "Books",
  "Exercise & Fitness",
  "Tools & Home Improvement",
  "Automotive",
  "Men's Clothing",
  "Watches",
  "Musical Instruments",
  "Women's Clothing",
  "Fragrance",
  "Office Products",
  "Skin Care",
  "Vitamins & Dietary Supplements",
  "Pet Supplies",
  "Men's Shoes",
  "Hair Care",
  "Women's Shoes",
  "Camera & Photo",
  "Baby",
  "Car Electronics & Accessories",
  "Office Electronics",
  "TV & Video",
  "Wearable Technology",
  "Fashion Accessories",
];

describe("departmentSlug", () => {
  it("drops possessives and collapses punctuation", () => {
    expect(departmentSlug("Men's Shoes")).toBe("mens-shoes");
    expect(departmentSlug("Women’s Clothing")).toBe("womens-clothing");
    expect(departmentSlug("Cell Phones & Accessories")).toBe(
      "cell-phones-accessories",
    );
    expect(departmentSlug("  TV & Video ")).toBe("tv-video");
  });

  it("keys overrides under dept-", () => {
    expect(departmentImageKey("Hair Care")).toBe("dept-hair-care");
  });
});

describe("departmentImage", () => {
  it("has a shipped, small photo for every department we hold", () => {
    for (const label of SHOT_LABELS) {
      const image = departmentImage(label);
      expect(image, label).not.toBeNull();
      const file = join(PUBLIC_DIR, image!.src);
      expect(existsSync(file), file).toBe(true);
      expect(statSync(file).size, file).toBeLessThan(120 * 1024);
    }
  });

  it("returns null for a shelf with no photo, so the icon tile draws", () => {
    expect(departmentImage("All categories")).toBeNull();
    expect(departmentImage("Bicycle-powered thingamajigs")).toBeNull();
  });

  it("keeps the tile decorative even when an override describes the photo", () => {
    const image = departmentImage("Books", {
      "dept-books": { key: "dept-books", alt: "A stack of books", position: "50% 20%" },
    });
    expect(image?.alt).toBe("");
    expect(image?.position).toBe("50% 20%");
  });

  it("ignores an uploaded replacement, which /api/media cannot serve", () => {
    const image = departmentImage("Books", {
      "dept-books": {
        key: "dept-books",
        storage_path: "uploads/x.webp",
        width: 600,
        height: 600,
      },
    });
    expect(image?.src).toBe("/images/departments/books.webp");
  });
});
