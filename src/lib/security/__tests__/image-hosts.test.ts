import { describe, expect, it } from "vitest";

import { imageOptimizerDecision, isAllowedImageHost } from "../image-hosts";

describe("isAllowedImageHost", () => {
  it("allows the observed CDN hosts exactly", () => {
    expect(isAllowedImageHost("m.media-amazon.com")).toBe(true);
    expect(isAllowedImageHost("i.ebayimg.com")).toBe(true);
    expect(isAllowedImageHost("i5.walmartimages.com")).toBe(true);
    expect(isAllowedImageHost("i.etsystatic.com")).toBe(true);
    expect(isAllowedImageHost("cdn.shopify.com")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isAllowedImageHost("M.MEDIA-AMAZON.COM")).toBe(true);
  });

  it("allows subdomains of registered store domains", () => {
    expect(isAllowedImageHost("static.nike.com")).toBe(true);
    expect(isAllowedImageHost("productimages.microcenter.com")).toBe(true);
    expect(isAllowedImageHost("www.amazon.com")).toBe(true);
  });

  it("does not allow an exact-only CDN host's apex or a lookalike domain", () => {
    // media-amazon.com itself was never observed, only the m. subdomain, and
    // it isn't a registered store domain either.
    expect(isAllowedImageHost("media-amazon.com")).toBe(false);
    expect(isAllowedImageHost("evil-m.media-amazon.com.attacker.com")).toBe(false);
    expect(isAllowedImageHost("notamazon.com")).toBe(false);
  });

  it("rejects a real generic-store host seen in production data", () => {
    // www.cmcpro.com showed up in hosted-dev extraction_cache — a store
    // nobody registered. It must NOT be allowed through the optimizer;
    // imageOptimizerDecision is what keeps its photo working anyway
    // (passed through same-origin, unoptimized) instead of the optimizer 400ing it.
    expect(isAllowedImageHost("www.cmcpro.com")).toBe(false);
  });

  it("rejects an attacker-controlled host entirely", () => {
    expect(isAllowedImageHost("evil.example.com")).toBe(false);
  });
});

describe("imageOptimizerDecision", () => {
  it("allows an allowlisted external host", () => {
    expect(imageOptimizerDecision("https://m.media-amazon.com/images/I/x.jpg")).toEqual({ action: "allow" });
  });

  it("allows a same-origin path with no host to check", () => {
    expect(imageOptimizerDecision("/images/marketing/hero.jpg")).toEqual({ action: "allow" });
  });

  it("allows a missing or unparseable url param, leaving it to Next's own handler", () => {
    expect(imageOptimizerDecision(null)).toEqual({ action: "allow" });
    expect(imageOptimizerDecision("not a url")).toEqual({ action: "allow" });
  });

  it("redirects a real generic-store host straight to the original image", () => {
    const src = "https://www.cmcpro.com/photos/widget.jpg";
    expect(imageOptimizerDecision(src)).toEqual({ action: "passthrough", to: src });
  });

  it("redirects an attacker-controlled host rather than letting the optimizer fetch it", () => {
    const src = "https://evil.example.com/pixel.png";
    expect(imageOptimizerDecision(src)).toEqual({ action: "passthrough", to: src });
  });
});
