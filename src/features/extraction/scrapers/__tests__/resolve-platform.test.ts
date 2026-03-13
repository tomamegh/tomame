import { describe, it, expect } from "vitest";
import { resolvePlatform } from "../resolve-platform";
import { SupportedPlatform } from "../registry";

describe("resolvePlatform", () => {
  it("should resolve amazon.com URLs", () => {
    expect(resolvePlatform("https://www.amazon.com/dp/B0DSVMVYPH")).toBe(
      SupportedPlatform.AMAZON,
    );
  });

  it("should resolve amazon.co.uk URLs", () => {
    expect(resolvePlatform("https://www.amazon.co.uk/dp/B0DSVMVYPH")).toBe(
      SupportedPlatform.AMAZON,
    );
  });

  it("should resolve bare amazon.com without www", () => {
    expect(resolvePlatform("https://amazon.com/dp/B0DSVMVYPH")).toBe(
      SupportedPlatform.AMAZON,
    );
  });

  it("should resolve amazon subdomains (e.g. smile.amazon.com)", () => {
    expect(resolvePlatform("https://smile.amazon.com/dp/B0DSVMVYPH")).toBe(
      SupportedPlatform.AMAZON,
    );
  });

  it("should resolve amazon URLs with query params", () => {
    expect(
      resolvePlatform(
        "https://www.amazon.com/dp/B0DSVMVYPH?ref=something&tag=test",
      ),
    ).toBe(SupportedPlatform.AMAZON);
  });

  it("should return null for unsupported platforms", () => {
    expect(resolvePlatform("https://www.etsy.com/listing/12345")).toBeNull();
  });

  it("should return null for invalid URLs", () => {
    expect(resolvePlatform("not-a-url")).toBeNull();
  });

  it("should return null for empty string", () => {
    expect(resolvePlatform("")).toBeNull();
  });

  it("should resolve a.co short URLs (Amazon mobile sharing)", () => {
    expect(resolvePlatform("https://a.co/d/0cdrsoXt")).toBe(
      SupportedPlatform.AMAZON,
    );
  });

  it("should resolve walmart.com URLs", () => {
    expect(resolvePlatform("https://www.walmart.com/ip/some-product/12345")).toBe(
      SupportedPlatform.WALMART,
    );
  });

  it("should resolve bare walmart.com without www", () => {
    expect(resolvePlatform("https://walmart.com/ip/some-product/12345")).toBe(
      SupportedPlatform.WALMART,
    );
  });

  it("should resolve walmart.ca URLs", () => {
    expect(resolvePlatform("https://www.walmart.ca/ip/some-product/12345")).toBe(
      SupportedPlatform.WALMART,
    );
  });

  it("should resolve costco.com URLs", () => {
    expect(resolvePlatform("https://www.costco.com/p/-/4000398506")).toBe(
      SupportedPlatform.COSTCO,
    );
  });

  it("should resolve bare costco.com without www", () => {
    expect(resolvePlatform("https://costco.com/some-product.product.12345.html")).toBe(
      SupportedPlatform.COSTCO,
    );
  });
});
