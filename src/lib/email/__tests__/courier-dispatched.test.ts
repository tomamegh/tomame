import { describe, expect, it } from "vitest";

import { courierDispatchedTemplate, type CourierDispatchedEmailData } from "../templates/courier-dispatched";

const BASE: CourierDispatchedEmailData = {
  orderNo: "TM-00042",
  productName: "Nike Air Max 90",
  quantity: 2,
  orderUrl: "https://tomame.ca/app/orders/o1",
  courierName: "Kofi",
  phoneE164: "+233244123456",
  phoneDisplay: "+233 24 412 3456",
  trackingUrl: "https://yango.com/t/abc",
  providerName: "Yango",
  isUpdate: false,
};

describe("courierDispatchedTemplate", () => {
  it("is a complete shell email with a tap-to-call link and the tracking button", () => {
    const email = courierDispatchedTemplate(BASE);
    expect(email.subject).toBe("Your package is on its way to you: TM-00042");
    expect(email.html).toMatch(/^<!DOCTYPE html>/);
    expect(email.html).toContain('href="tel:+233244123456"');
    expect(email.html).toContain("Track your rider on Yango");
    expect(email.html).toContain('href="https://yango.com/t/abc"');
    expect(email.html).toContain("https://tomame.ca/app/orders/o1");
    expect(email.html).not.toMatch(/<img/i);
    expect(email.html).not.toMatch(/GH₵|\$\d/);
  });

  it("carries a plain-text version with the number, the link and the order", () => {
    const { text } = courierDispatchedTemplate(BASE);
    expect(text).not.toMatch(/<[a-z!/]/i);
    expect(text).toContain("+233 24 412 3456");
    expect(text).toContain("https://yango.com/t/abc");
    expect(text).toContain("Order: TM-00042");
    expect(text).toContain("Quantity: 2");
    expect(text).toContain("support@tomame.ca");
  });

  it("falls back to the order page when there is no tracking link", () => {
    const email = courierDispatchedTemplate({ ...BASE, trackingUrl: null, providerName: null });
    expect(email.html).not.toContain("Track your rider");
    expect(email.html).toContain("See your order");
  });

  it("works with a link and no phone or name", () => {
    const email = courierDispatchedTemplate({
      ...BASE,
      courierName: null,
      phoneE164: null,
      phoneDisplay: null,
      providerName: null,
    });
    expect(email.html).not.toContain("tel:");
    expect(email.html).toContain("Our rider has your package");
    expect(email.html).toContain("Track your rider");
  });

  it("says when it replaces earlier details", () => {
    const email = courierDispatchedTemplate({ ...BASE, isUpdate: true });
    expect(email.subject).toBe("Updated rider details for TM-00042");
    expect(email.html).toContain("replace the ones we sent before");
  });

  it("escapes the rider's name and the product title", () => {
    const email = courierDispatchedTemplate({ ...BASE, courierName: "<b>Kofi</b>", productName: "Tom & Jerry" });
    expect(email.html).not.toContain("<b>Kofi</b>");
    expect(email.html).toContain("&lt;b&gt;Kofi&lt;/b&gt;");
    expect(email.html).toContain("Tom &amp; Jerry");
  });
});
