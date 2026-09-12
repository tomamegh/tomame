import { describe, it, expect } from "vitest";
import { MARKETING_IMAGES, applyImageOverride } from "@/config/marketing-images";

/**
 * Regression: the uploaded-image branch used to require the optional `key`
 * argument, and four call sites (about/page.tsx, landing-hero, closing-cta,
 * regions-strip) call applyImageOverride with only two. An upload therefore
 * saved to the database and storage while the page kept rendering the manifest
 * default — silently, on six of the eleven slots including the hero.
 */
describe("uploaded images resolve without an explicit key argument", () => {
  const base = MARKETING_IMAGES["mk-hero-photo"];
  const uploaded = {
    key: "mk-hero-photo",
    storage_path: "marketing/mk-hero-photo-abc123.webp",
    width: 1200,
    height: 1600,
  };

  it("uses the uploaded image when called with two arguments", () => {
    const result = applyImageOverride(base, uploaded);
    expect(result.src).toContain("/api/media/mk-hero-photo");
    expect(result.width).toBe(1200);
    expect(result.height).toBe(1600);
  });

  it("busts cache using the storage object name", () => {
    const result = applyImageOverride(base, uploaded);
    expect(result.src).toContain("mk-hero-photo-abc123.webp");
  });

  it("still works when the key is passed explicitly", () => {
    const result = applyImageOverride(base, uploaded, "mk-hero-photo");
    expect(result.src).toContain("/api/media/mk-hero-photo");
  });

  it("keeps the manifest image when an upload lacks dimensions", () => {
    const { width: _w, height: _h, ...noDims } = uploaded;
    const result = applyImageOverride(base, noDims);
    expect(result.src).toBe(base.src);
  });

  it("applies crop and alt alongside an uploaded image", () => {
    const result = applyImageOverride(base, {
      ...uploaded,
      position: "50% 20%",
      alt: "New photo",
    });
    expect(result.src).toContain("/api/media/");
    expect(result.position).toBe("50% 20%");
    expect(result.alt).toBe("New photo");
  });
});
