import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logger } from "@/lib/logger";
import {
  MARKETING_IMAGES,
  applyImageOverride,
  resolveMarketingImage,
} from "@/config/marketing-images";

const portrait = MARKETING_IMAGES["mk-cta-photo"];

describe("applyImageOverride", () => {
  it("ignores a src override that carries no dimensions, and warns", () => {
    const result = applyImageOverride(
      portrait,
      { src: "/images/marketing/mk-about-2.webp" },
      "mk-cta-photo",
    );

    expect(result.src).toBe(portrait.src);
    expect(result.width).toBe(portrait.width);
    expect(result.height).toBe(portrait.height);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("src set without paired width/height"),
      expect.objectContaining({ key: "mk-cta-photo" }),
    );
  });

  it("still applies alt and position when the src is dropped", () => {
    const result = applyImageOverride(
      portrait,
      {
        src: "/images/marketing/mk-about-2.webp",
        alt: "A new description",
        position: "50% 20%",
      },
      "mk-region-uk",
    );

    expect(result.src).toBe(portrait.src);
    expect(result.alt).toBe("A new description");
    expect(result.position).toBe("50% 20%");
  });

  it("honours a src override that arrives with both dimensions", () => {
    const result = applyImageOverride(
      portrait,
      { src: "/images/marketing/mk-about-2.webp", width: 1448, height: 1086 },
      "mk-about-1",
    );

    expect(result.src).toBe("/images/marketing/mk-about-2.webp");
    expect(result.width).toBe(1448);
    expect(result.height).toBe(1086);
  });

  it("applies a position-only override and leaves geometry alone", () => {
    const result = applyImageOverride(portrait, { position: "50% 45%" });
    expect(result).toEqual({ ...portrait, position: "50% 45%" });
  });

  it("returns the manifest image untouched when there is no override", () => {
    expect(applyImageOverride(portrait, undefined)).toBe(portrait);
  });
});

describe("resolveMarketingImage", () => {
  it("passes the key through so a bad row is identifiable", () => {
    const result = resolveMarketingImage("mk-delivery-photo", {
      "mk-delivery-photo": { src: "/images/marketing/mk-about-2.webp" },
    });

    expect(result?.src).toBe(MARKETING_IMAGES["mk-delivery-photo"].src);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ key: "mk-delivery-photo" }),
    );
  });

  it("returns null for an unknown key", () => {
    expect(resolveMarketingImage("nope")).toBeNull();
    expect(resolveMarketingImage(null)).toBeNull();
  });
});
