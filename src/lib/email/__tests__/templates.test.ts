import { describe, expect, it } from "vitest";
import {
  orderPaidTemplate,
  orderProcessingTemplate,
  orderShippedTemplate,
  orderDeliveredTemplate,
  orderPlacedTemplate,
  orderCancelledTemplate,
  orderApprovedTemplate,
  orderRejectedTemplate,
} from "../templates/order-status";
import { parcelPhotoTemplate } from "../templates/parcel-photo";
import { pastePricedTemplate, pasteUnreadableTemplate } from "../templates/paste-finished";
import { paymentExpiredTemplate, unpaidOrderCancelledTemplate } from "../templates/payment-expiry";
import { priceDropTemplate } from "../templates/price-drop";
import { sourcingAvailableTemplate, sourcingUnavailableTemplate } from "../templates/sourcing-answered";
import { resetPasswordTemplate } from "../templates/reset-password";
import { verifyEmailTemplate } from "../templates/verify-email";
import { escapeHtml } from "../templates/layout";
import { htmlToText } from "../plain-text";

const ORDER = { productName: "Sony WH-1000XM5", orderId: "3f1c2a9e-0000-4000-8000-000000000001" };
const PAY = "https://tomame.ca/app/orders/3f1c2a9e-0000-4000-8000-000000000001";

const ALL = {
  orderPaid: orderPaidTemplate(ORDER),
  orderProcessing: orderProcessingTemplate(ORDER),
  orderShipped: orderShippedTemplate({ ...ORDER, trackingNumber: "TM-00042", estimatedDeliveryDate: "Fri 10 Oct" }),
  orderDelivered: orderDeliveredTemplate(ORDER),
  orderPlaced: orderPlacedTemplate({ ...ORDER, totalGhs: 5120, needsReview: false, paymentUrl: PAY }),
  orderPlacedReview: orderPlacedTemplate({ ...ORDER, totalGhs: 5120, needsReview: true }),
  orderCancelled: orderCancelledTemplate(ORDER),
  orderApproved: orderApprovedTemplate({ ...ORDER, totalGhs: 5120, paymentUrl: PAY, priceChanged: true }),
  orderRejected: orderRejectedTemplate({ ...ORDER, reason: "The seller does not ship to our hub." }),
  parcelPhoto: parcelPhotoTemplate({ productName: "Nike Air Max 90", orderNo: "TM-00042", journeyUrl: PAY, location: "New York", weightLbs: 2.4, photoCount: 3 }),
  pastePriced: pastePricedTemplate({ storeHost: "amazon.com", productName: "Kindle Paperwhite", destinationUrl: PAY }),
  pasteUnreadable: pasteUnreadableTemplate({ storeHost: "shein.com", productName: null, destinationUrl: PAY }),
  paymentExpired: paymentExpiredTemplate({ amountGhs: 812.4, reference: "TM-PAY-8812", retryUrl: PAY, expiryMinutes: 30 }),
  unpaidCancelled: unpaidOrderCancelledTemplate({ subject: "Your bag of 2 items", amountGhs: 812.4, ttlHours: 48, shopUrl: PAY }),
  priceDrop: priceDropTemplate({ productName: "iPad Air", productUrl: "https://apple.com/x", watchUrl: PAY, previousPriceUsd: 400, currentPriceUsd: 320, dropPct: 0.2, currentTotalGhs: 5120, exchangeRate: 16 }),
  sourcingAvailable: sourcingAvailableTemplate({ productName: "Le Creuset pot", note: "Only the red one is left.", destinationUrl: PAY }),
  sourcingUnavailable: sourcingUnavailableTemplate({ productName: "Le Creuset pot", note: null, destinationUrl: PAY }),
  resetPassword: resetPasswordTemplate(PAY),
  verifyEmail: verifyEmailTemplate(PAY),
};

describe("every email", () => {
  for (const [name, email] of Object.entries(ALL)) {
    describe(name, () => {
      it("is a complete, dark-mode-aware document with no images", () => {
        expect(email.subject.length).toBeGreaterThan(0);
        expect(email.html).toMatch(/^<!DOCTYPE html>/);
        expect(email.html).toContain('name="color-scheme" content="light dark"');
        expect(email.html).toContain("support@tomame.ca");
        expect(email.html).not.toMatch(/<img/i);
        expect(email.html).not.toMatch(/<link\b/i);
      });

      it("carries a plain-text version with the button's destination and no markup", () => {
        expect(email.text.length).toBeGreaterThan(80);
        expect(email.text).not.toMatch(/<[a-z!/]/i);
        const cta = /<v:roundrect[^>]*href="([^"]+)"/.exec(email.html)?.[1];
        expect(cta).toBeTruthy();
        expect(email.text).toContain(cta!.replace(/&amp;/g, "&"));
        expect(email.text).toContain("support@tomame.ca");
      });
    });
  }

  it("keeps the parcel email free of prices", () => {
    expect(ALL.parcelPhoto.html).not.toMatch(/GH₵|\$\d/);
    expect(ALL.parcelPhoto.text).toContain("Order: TM-00042");
  });

  it("puts row labels and values on one line in plain text", () => {
    expect(ALL.priceDrop.text).toContain("Now (store price): $320.00");
    expect(ALL.priceDrop.text).toContain("Landed total: GH₵ 5120.00");
    expect(ALL.orderShipped.text).toContain("Order reference: TM-00042");
  });

  it("shows the TM number as the reference and keeps the UUID only in links", () => {
    const paid = orderPaidTemplate({ ...ORDER, trackingNumber: "TM-00042" });
    expect(paid.text).toContain("Order reference: TM-00042");
    expect(paid.html).toContain(`/app/orders/${ORDER.orderId}`);
    expect(paid.html.replace(/href="[^"]*"/g, "")).not.toContain(ORDER.orderId);
    // An order with no TM number yet keeps the old reference.
    expect(ALL.orderPaid.text).toContain(`Order reference: ${ORDER.orderId}`);
  });

  it("shows order progress in plain text", () => {
    expect(ALL.orderProcessing.text).toContain("Progress: Paid > [Purchased] > On the way > Delivered");
  });

  it("leaves the preheader out of the plain text", () => {
    expect(ALL.orderPaid.html).toContain("Our buyers are on it.");
    expect(ALL.orderPaid.text).not.toContain("Our buyers are on it.");
  });

  it("only offers to switch notifications off where they can be", () => {
    expect(ALL.orderPaid.html).toContain("Manage email notifications");
    expect(ALL.resetPassword.html).not.toContain("Manage email notifications");
  });
});

describe("escaping", () => {
  it("escapes scraped titles and free-text notes", () => {
    const email = sourcingAvailableTemplate({
      productName: `<script>alert(1)</script> Tom & Jerry`,
      note: `"quoted" <b>bold</b>`,
      destinationUrl: PAY,
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("Tom &amp; Jerry");
    expect(email.html).not.toContain("<b>bold</b>");
    expect(email.text).toContain("<script>alert(1)</script> Tom & Jerry");
  });

  it("escapes every HTML-significant character", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});

describe("htmlToText", () => {
  it("turns links into label: url and mailto into the address", () => {
    expect(htmlToText(`<p>Go <a href="https://a.test/x?a=1&amp;b=2">here</a> or <a href="mailto:s@t.test">s@t.test</a></p>`)).toBe(
      "Go here: https://a.test/x?a=1&b=2 or s@t.test",
    );
  });

  it("drops skipped regions, head and Outlook conditionals", () => {
    const html = `<head><style>p{}</style></head><body><!--text:skip-->hidden<!--/text:skip--><!--[if mso]>vml<![endif]--><p>Shown</p></body>`;
    expect(htmlToText(html)).toBe("Shown");
  });
});

describe("purchased email — store tracking", () => {
  it("shows the store's tracking only when given", async () => {
    const { orderProcessingTemplate } = await import("../templates/order-status");
    const plain = orderProcessingTemplate({ productName: "Sony WH-1000XM5", orderId: "o1", trackingNumber: "TM-00042" });
    expect(plain.html).not.toContain("Store tracking");
    const shared = orderProcessingTemplate({
      productName: "Sony WH-1000XM5",
      orderId: "o1",
      trackingNumber: "TM-00042",
      storeTracking: [{ carrier: "UPS", number: "1Z 999 AA1 0123 4567 84" }],
    });
    expect(shared.subject).toBe("We've purchased your item");
    expect(shared.html).toContain("Store tracking");
    expect(shared.html).toContain("UPS 1Z 999 AA1 0123 4567 84");
    expect(shared.html).toContain("TM-00042");
  });
});
