import { describe, it, expect, vi, afterEach } from "vitest";
import { defaultCurrencyForUrl, hashUrl, isShortUrl, normalizeUrl, regionForUrl, resolveShortUrl } from "../url";
import { amazonScraper } from "../scrapers/amazon";
import { ebayScraper } from "../scrapers/ebay";
import { sheinScraper } from "../scrapers/shein";
import { microcenterScraper } from "../scrapers/microcenter";

describe("url normalization", () => {
  it("drops tracking params and fragments, sorts the rest", () => {
    const a = normalizeUrl("https://www.amazon.com/dp/B0DSVMVYPH?ref=sr_1&tag=abc&th=1#reviews");
    const b = normalizeUrl("https://www.amazon.com/dp/B0DSVMVYPH");
    expect(a).toBe(b);
  });

  it("hashes equal normalized URLs equally", () => {
    expect(hashUrl("https://www.ebay.com/itm/123456789012?hash=item1&epid=2")).toBe(
      hashUrl("https://www.ebay.com/itm/123456789012"),
    );
  });

  it("detects short links", () => {
    expect(isShortUrl("https://a.co/d/0cdrsoXt")).toBe(true);
    expect(isShortUrl("https://ebay.us/abc")).toBe(true);
    expect(isShortUrl("https://www.amazon.com/dp/B0DSVMVYPH")).toBe(false);
  });

  it("maps store domains to regions and currencies", () => {
    expect(regionForUrl("https://www.amazon.com/dp/B0DSVMVYPH")).toBe("USA");
    expect(regionForUrl("https://www.amazon.co.uk/dp/B0DSVMVYPH")).toBe("UK");
    expect(regionForUrl("https://www.ebay.co.uk/itm/123456789012")).toBe("UK");
    expect(regionForUrl("https://us.shein.com/x-p-123.html")).toBe("CHINA");
    expect(regionForUrl("https://www.etsy.com/listing/1")).toBeNull();
    expect(defaultCurrencyForUrl("https://www.amazon.co.uk/dp/B0DSVMVYPH")).toBe("GBP");
    expect(defaultCurrencyForUrl("https://www.amazon.com/dp/B0DSVMVYPH")).toBe("USD");
  });
});

describe("product URL validation (no spend on non-product links)", () => {
  it("amazon: accepts /dp/ASIN and /gp/product/ASIN, rejects search", () => {
    expect(amazonScraper.isProductUrl("https://www.amazon.com/dp/B0DSVMVYPH")).toBe(true);
    expect(amazonScraper.isProductUrl("https://www.amazon.com/Some-Title/dp/B0DSVMVYPH/ref=sr_1_1")).toBe(true);
    expect(amazonScraper.isProductUrl("https://www.amazon.com/gp/product/B0DSVMVYPH")).toBe(true);
    expect(amazonScraper.isProductUrl("https://www.amazon.com/s?k=desk")).toBe(false);
    expect(amazonScraper.canonicalUrl("https://www.amazon.com/Some-Title/dp/B0DSVMVYPH/ref=sr_1_1?th=1")).toBe(
      "https://www.amazon.com/dp/B0DSVMVYPH",
    );
  });

  it("ebay: accepts /itm/<id> with or without slug", () => {
    expect(ebayScraper.isProductUrl("https://www.ebay.com/itm/Example-Title/123456789012?hash=x")).toBe(true);
    expect(ebayScraper.isProductUrl("https://www.ebay.com/sch/i.html?_nkw=phone")).toBe(false);
    expect(ebayScraper.canonicalUrl("https://www.ebay.com/itm/Example-Title/123456789012?hash=x")).toBe(
      "https://www.ebay.com/itm/123456789012",
    );
  });

  it("shein: accepts -p-<goods id>.html and pins to us.shein.com", () => {
    expect(sheinScraper.isProductUrl("https://www.shein.com/Example-p-12345678-cat-1234.html")).toBe(true);
    expect(sheinScraper.isProductUrl("https://www.shein.com/women-dresses-c-1727.html")).toBe(false);
    expect(sheinScraper.canonicalUrl("https://m.shein.com/Example-p-12345678.html?x=1")).toBe(
      "https://us.shein.com/Example-p-12345678.html",
    );
  });

  it("microcenter: accepts /product/<id>", () => {
    expect(microcenterScraper.isProductUrl("https://www.microcenter.com/product/683524/foo")).toBe(true);
    expect(microcenterScraper.isProductUrl("https://www.microcenter.com/search/search_results.aspx?Ntt=gpu")).toBe(false);
  });
});

describe("resolveShortUrl (public endpoint — no open redirect follow)", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("follows a shortener onto a supported store", async () => {
    global.fetch = vi.fn().mockResolvedValue({ headers: new Headers({ location: "https://www.amazon.com/dp/B01MRZ02TL" }) });
    expect(await resolveShortUrl("https://a.co/d/abc")).toBe("https://www.amazon.com/dp/B01MRZ02TL");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("refuses to follow a shortener onto an arbitrary host", async () => {
    global.fetch = vi.fn().mockResolvedValue({ headers: new Headers({ location: "http://169.254.169.254/latest/meta-data" }) });
    expect(await resolveShortUrl("https://bit.ly/evil")).toBe("https://bit.ly/evil");
    expect(global.fetch).toHaveBeenCalledTimes(1); // never requested the internal host
  });

  it("does not request non-shortener hosts at all", async () => {
    global.fetch = vi.fn();
    expect(await resolveShortUrl("https://www.example.com/x")).toBe("https://www.example.com/x");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
