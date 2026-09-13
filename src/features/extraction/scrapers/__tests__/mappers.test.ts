import { describe, it, expect } from "vitest";
import * as cheerio from "cheerio";
import { mapApifyAmazonProduct } from "../amazon";
import { ebayScraper, mapApifyEbayProduct } from "../ebay";
import { mapApifySheinProduct } from "../shein";
import { mapApifyMicrocenterProduct, microcenterScraper } from "../microcenter";

describe("mapApifyAmazonProduct — typed facts", () => {
  it("sets seller, rating, review count, images and availability; never invents a condition", () => {
    const p = mapApifyAmazonProduct(
      {
        title: "Desk",
        price: 99.5,
        soldBy: "Amazon.com",
        productRating: "4.5 out of 5 stars",
        countReview: 1234,
        warehouseAvailability: "In Stock",
        imageUrlList: ["https://m.media-amazon.com/1.jpg", "https://m.media-amazon.com/1.jpg", "//m.media-amazon.com/2.jpg"],
      },
      "https://www.amazon.com/dp/B0DSVMVYPH",
    );
    expect(p.seller).toBe("Amazon.com");
    expect(p.rating).toBe(4.5);
    expect(p.review_count).toBe(1234);
    expect(p.availability).toBe("In Stock");
    expect(p.condition).toBeNull();
    expect(p.images).toEqual(["https://m.media-amazon.com/1.jpg", "https://m.media-amazon.com/2.jpg"]);
    expect(p.image).toBe(p.images[0]);
    expect(p.variants).toEqual({});
  });
});

describe("mapApifyEbayProduct — typed facts", () => {
  it("sets seller and condition as stated and leaves rating/availability null", () => {
    const p = mapApifyEbayProduct({
      title: "Phone",
      price: "949.99",
      currency: "USD",
      seller: { username: "t4c-llc" },
      condition: "Excellent - Refurbished",
      mainImage: "https://i.ebayimg.com/main.jpg",
      images: ["https://i.ebayimg.com/1.jpg", "https://i.ebayimg.com/main.jpg"],
    });
    expect(p.seller).toBe("t4c-llc");
    expect(p.condition).toBe("Excellent - Refurbished");
    expect(p.rating).toBeNull();
    expect(p.review_count).toBeNull();
    expect(p.availability).toBeNull();
    expect(p.images).toEqual(["https://i.ebayimg.com/main.jpg", "https://i.ebayimg.com/1.jpg"]);
    expect(p.image).toBe("https://i.ebayimg.com/main.jpg");
  });
});

describe("ebayScraper.extract — typed facts", () => {
  const html = `<html><body>
    <h1 class="x-item-title__mainTitle"><span class="ux-textspans">Apple iPhone 15 Pro</span></h1>
    <div class="x-price-primary"><span class="ux-textspans">US $949.99</span></div>
    <div class="x-item-condition-text"><span class="ux-textspans">Excellent - Refurbished</span></div>
    <div class="x-sellercard-atf__info__about-seller"><a href="#">t4c-llc</a></div>
    <div class="x-quantity__availability"><span class="ux-textspans">More than 10 available</span></div>
    <div class="x-msku__box-cont"><span class="x-msku__label">Color:</span>
      <select class="x-msku__select-box" aria-label="Color">
        <option>- Select -</option><option>Black Titanium</option><option>Blue Titanium</option><option disabled>Natural Titanium</option>
      </select></div>
    <div class="x-msku__box-cont"><span class="x-msku__label">Storage Capacity:</span>
      <select class="x-msku__select-box">
        <option>Select</option><option>128 GB</option><option>256 GB (Out of stock)</option>
      </select></div>
    <div class="ux-image-carousel-item"><img src="https://i.ebayimg.com/1.jpg" data-zoom-src="https://i.ebayimg.com/1-zoom.jpg"></div>
    <div class="ux-image-carousel-item"><img src="https://i.ebayimg.com/2.jpg"></div>
  </body></html>`;
  const p = ebayScraper.extract(cheerio.load(html));

  it("reads seller, condition, availability and MSKU options (available ones only)", () => {
    expect(p.seller).toBe("t4c-llc");
    expect(p.condition).toBe("Excellent - Refurbished");
    expect(p.availability).toBe("More than 10 available");
    expect(p.variants).toEqual({ color: ["Black Titanium", "Blue Titanium"], storage_capacity: ["128 GB"] });
    expect(p.images).toEqual(["https://i.ebayimg.com/1-zoom.jpg", "https://i.ebayimg.com/2.jpg"]);
    expect(p.image).toBe(p.images[0]);
    expect(p.rating).toBeNull();
    expect(p.metadata.condition).toBe("Excellent - Refurbished"); // legacy copy kept
  });
});

describe("mapApifySheinProduct — typed facts", () => {
  it("lists only in-stock sizes as variants and parses rating/review count", () => {
    const p = mapApifySheinProduct({
      title: "Dress",
      sale_price: { usd_amount: 12.5, currency: "USD" },
      color: "Light Blue",
      sizes: [
        { attr_value_name_en: "S", is_sold_out: false },
        { attr_value_name_en: "M", is_sold_out: true },
        { attr_value_name: "L" },
      ],
      rating: "4.8",
      review_count: "1.2k",
      main_image: "//img.ltwebstatic.com/main.jpg",
      images: ["//img.ltwebstatic.com/1.jpg", "//img.ltwebstatic.com/main.jpg"],
    });
    expect(p.variants).toEqual({ size: ["S", "L"] });
    expect(p.metadata.availableSizes).toEqual(["S", "M", "L"]); // legacy list untouched
    expect(p.specifications["Color"]).toBe("Light Blue"); // chosen colour stays in specs
    expect(p.rating).toBe(4.8);
    expect(p.review_count).toBe(1200);
    expect(p.images).toEqual(["https://img.ltwebstatic.com/main.jpg", "https://img.ltwebstatic.com/1.jpg"]);
    expect(p.image).toBe(p.images[0]);
    expect(p.seller).toBeNull();
    expect(p.condition).toBeNull();
    expect(p.availability).toBeNull();
  });
});

describe("mapApifyMicrocenterProduct — typed facts", () => {
  it("sets availability and images and nothing else", () => {
    const p = mapApifyMicrocenterProduct({ product_name: "GPU", price: 599, availability: "In stock at Tustin", images: ["https://productimages.microcenter.com/1.jpg"] });
    expect(p.availability).toBe("In stock at Tustin");
    expect(p.images).toEqual(["https://productimages.microcenter.com/1.jpg"]);
    expect(p).toMatchObject({ seller: null, condition: null, rating: null, review_count: null, variants: {} });
  });
});

describe("microcenterScraper.extract — typed facts", () => {
  it("reads condition, availability and aggregateRating from the Product JSON-LD", () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "GeForce RTX 5070",
      image: ["https://productimages.microcenter.com/1.jpg", "https://productimages.microcenter.com/2.jpg"],
      aggregateRating: { "@type": "AggregateRating", ratingValue: "4.6", reviewCount: "18" },
      offers: { "@type": "Offer", price: "599.99", priceCurrency: "USD", itemCondition: "https://schema.org/NewCondition", availability: "https://schema.org/InStock" },
    })}</script></head><body><h1>GeForce RTX 5070</h1></body></html>`;
    const p = microcenterScraper.extract(cheerio.load(html));
    expect(p.condition).toBe("New");
    expect(p.availability).toBe("In Stock");
    expect(p.rating).toBe(4.6);
    expect(p.review_count).toBe(18);
    expect(p.images).toEqual([
      "/api/img-proxy?src=https%3A%2F%2Fproductimages.microcenter.com%2F1.jpg",
      "/api/img-proxy?src=https%3A%2F%2Fproductimages.microcenter.com%2F2.jpg",
    ]);
    expect(p.image).toBe(p.images[0]);
  });
});

describe("unmapped store categories are left null for the classifier", () => {
  it("mapApifyMicrocenterProduct: unknown category → null, breadcrumbs exposed", () => {
    const p = mapApifyMicrocenterProduct({ product_name: "PowerSpec G528 Gaming PC", price: 1099, category: "Gaming Desktops" });
    expect(p.category).toBeNull();
    expect(p.metadata.breadcrumbs).toEqual(["Gaming Desktops"]);
  });

  it("microcenterScraper.extract: unknown breadcrumb chain → null, chain exposed in metadata", () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify([
      { "@context": "https://schema.org", "@type": "Product", name: "PowerSpec G528 Gaming PC", offers: { "@type": "Offer", price: "1099.99", priceCurrency: "USD" } },
      { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home" },
        { "@type": "ListItem", position: 2, name: "Gaming" },
        { "@type": "ListItem", position: 3, name: "Gaming PCs" },
      ] },
    ])}</script></head><body><h1>PowerSpec G528 Gaming PC</h1></body></html>`;
    const p = microcenterScraper.extract(cheerio.load(html));
    expect(p.category).toBeNull();
    expect(p.metadata.breadcrumbs).toEqual(["Gaming", "Gaming PCs"]);
  });
});
