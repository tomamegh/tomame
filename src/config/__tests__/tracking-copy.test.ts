import { describe, expect, it } from "vitest";

import { orderSupportMessage, waMeHref } from "../tracking-copy";

describe("orderSupportMessage", () => {
  it("names the order and where it is, so nobody has to ask", () => {
    expect(orderSupportMessage("TM-12345", "In flight to Accra")).toBe("Hi Tomame, I have a question about my order TM-12345 (In flight to Accra).");
    expect(orderSupportMessage("TM-12345", null)).toBe("Hi Tomame, I have a question about my order TM-12345.");
    expect(orderSupportMessage("TM-12345", "Purchased", "I'd like to change the delivery.")).toBe(
      "Hi Tomame, I have a question about my order TM-12345 (Purchased). I'd like to change the delivery.",
    );
  });

  it("travels in a wa.me link intact", () => {
    const href = waMeHref("+233 59 442 4746", orderSupportMessage("TM-1", "Out for delivery"))!;
    expect(href.startsWith("https://wa.me/233594424746?text=")).toBe(true);
    expect(decodeURIComponent(href.split("?text=")[1]!)).toBe("Hi Tomame, I have a question about my order TM-1 (Out for delivery).");
  });
});
