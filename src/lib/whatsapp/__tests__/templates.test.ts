import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  WHATSAPP_TEMPLATES,
  formatGhsAmount,
  greetingName,
  placeholderCount,
  renderTemplateBody,
  whatsappMessages,
  type WhatsAppMessage,
  type WhatsAppTemplateKey,
} from "../templates";
import { signWhatsAppBody, verifyWhatsAppSignature } from "../signature";
import { parseWhatsAppWebhook } from "../webhook";

const entries = Object.entries(WHATSAPP_TEMPLATES) as [WhatsAppTemplateKey, (typeof WHATSAPP_TEMPLATES)[WhatsAppTemplateKey]][];

describe("template definitions obey Meta's rules", () => {
  it.each(entries)("%s", (_key, def) => {
    const n = placeholderCount(def.body);
    expect(def.samples).toHaveLength(n);
    // Placeholders are numbered 1..n with no gaps.
    for (let i = 1; i <= n; i++) expect(def.body).toContain(`{{${i}}}`);
    // Never at the start or end, never two side by side.
    expect(def.body.trim()).not.toMatch(/^\{\{\d+\}\}/);
    expect(def.body.trim()).not.toMatch(/\{\{\d+\}\}$/);
    expect(def.body).not.toMatch(/\}\}\s*\{\{/);
    // Meta: lowercase, digits and underscores; UTILITY; within length.
    expect(def.name).toMatch(/^[a-z0-9_]{1,512}$/);
    expect(def.body.length).toBeLessThanOrEqual(1024);
    expect(def.body.startsWith("Hi {{1}},")).toBe(true);
    if (def.button) expect(def.button.text.length).toBeLessThanOrEqual(25);
  });

  it("names are unique", () => {
    expect(new Set(entries.map(([, d]) => d.name)).size).toBe(entries.length);
  });

  it("every template is documented, body verbatim", () => {
    const doc = readFileSync(path.resolve(__dirname, "../../../../docs/whatsapp-templates.md"), "utf8");
    for (const [, def] of entries) {
      expect(doc).toContain(`\`${def.name}\``);
      expect(doc).toContain(def.body);
    }
  });
});

describe("builders fill every placeholder", () => {
  const built: [string, WhatsAppMessage | null][] = [
    ["placed", whatsappMessages.orderPlaced({ orderId: "o1", productName: "Shoes", totalGhs: 1845.2, needsReview: false })],
    ["in review", whatsappMessages.orderPlaced({ orderId: "o1", productName: "Shoes", totalGhs: 0, needsReview: true })],
    ...(["paid", "processing", "in_transit", "delivered", "cancelled"] as const).map(
      (status) => [status, whatsappMessages.orderStatus({ orderId: "o1", productName: "Shoes", status })] as [string, WhatsAppMessage | null],
    ),
    ["approved", whatsappMessages.orderReviewed({ orderId: "o1", productName: "Shoes", approved: true, totalGhs: 10 })],
    ["rejected", whatsappMessages.orderReviewed({ orderId: "o1", productName: "Shoes", approved: false, totalGhs: 10 })],
    ["photo", whatsappMessages.parcelPhoto({ orderId: "o1", orderNo: "TM-1", productName: "Shoes" })],
    ["expired", whatsappMessages.paymentExpired({ amountGhs: 12, reference: "R1", retryPath: "/app/bag" })],
    ["unpaid", whatsappMessages.unpaidCancelled({ what: "your bag of 2 items", ttlHours: 48 })],
    ["drop", whatsappMessages.priceDrop({ productName: "Shoes", dropPct: 14.6, totalGhs: 999, productUrl: "https://x.test/p" })],
    ["found", whatsappMessages.sourcingAnswered({ productName: "Shoes", available: true })],
    ["not found", whatsappMessages.sourcingAnswered({ productName: "Shoes", available: false })],
    ["rider", whatsappMessages.riderAssigned({ orderId: "o1", orderNo: "TM-1", productName: "Shoes", riderName: null, providerName: "Bolt", riderPhone: null, trackingUrl: null })],
    ["quote", whatsappMessages.quoteReady({ productName: "Shoes", reviewPath: "/app/orders/review/c1" })],
  ];

  it.each(built)("%s", (_label, message) => {
    expect(message).not.toBeNull();
    const def = WHATSAPP_TEMPLATES[message!.template];
    // {{1}} (the name) is prepended by the service.
    expect(message!.params.length + 1).toBe(placeholderCount(def.body));
    expect(renderTemplateBody(message!.template, ["Ama", ...message!.params])).not.toMatch(/\{\{/);
    expect(Boolean(message!.buttonPath)).toBe(Boolean(def.button));
  });

  it("covers every template", () => {
    const used = new Set(built.map(([, m]) => m!.template));
    expect([...used].sort()).toEqual(entries.map(([k]) => k).sort());
  });

  it("renders a rider message with sensible fallbacks", () => {
    const m = whatsappMessages.riderAssigned({ orderId: "o1", orderNo: "TM-1", productName: "Shoes", riderName: "Kojo", riderPhone: "+233 24 412 3456", trackingUrl: null });
    expect(renderTemplateBody(m.template, ["Ama", ...m.params])).toBe(
      "Hi Ama, your delivery rider Kojo has your package for order TM-1 and is on the way. Rider's phone: +233 24 412 3456. Live tracking: on your order page. See you soon!",
    );
    expect(m.buttonPath).toBe("/app/orders/o1");
  });

  it("has no message for a status customers are not told about, or a drop with no cedi total", () => {
    expect(whatsappMessages.orderStatus({ orderId: "o", productName: "p", status: "pending" })).toBeNull();
    expect(whatsappMessages.priceDrop({ productName: "p", dropPct: 10, totalGhs: null, productUrl: "u" })).toBeNull();
  });

  it("formats names and cedis", () => {
    expect(greetingName("  Ama Serwaa ")).toBe("Ama");
    expect(greetingName(null)).toBe("there");
    expect(formatGhsAmount(1845.2)).toBe("1,845.20");
  });
});

describe("webhook signature", () => {
  const secret = "app-secret";
  const body = '{"object":"whatsapp_business_account"}';

  it("accepts Meta's sha256= header over the raw body", () => {
    expect(verifyWhatsAppSignature(body, signWhatsAppBody(body, secret), secret)).toBe(true);
  });

  it("rejects a wrong secret, a tampered body, a missing or malformed header", () => {
    expect(verifyWhatsAppSignature(body, signWhatsAppBody(body, "other"), secret)).toBe(false);
    expect(verifyWhatsAppSignature(`${body} `, signWhatsAppBody(body, secret), secret)).toBe(false);
    expect(verifyWhatsAppSignature(body, null, secret)).toBe(false);
    expect(verifyWhatsAppSignature(body, "sha256=abc", secret)).toBe(false);
    expect(verifyWhatsAppSignature(body, signWhatsAppBody(body, secret).slice(7), secret)).toBe(false);
  });
});

describe("parseWhatsAppWebhook", () => {
  it("extracts statuses with errors and counts inbound messages", () => {
    const parsed = parseWhatsAppWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                statuses: [
                  { id: "wamid.1", status: "delivered", timestamp: "1759219200", recipient_id: "233244123456" },
                  {
                    id: "wamid.2",
                    status: "failed",
                    timestamp: "1759219260",
                    errors: [{ code: 131026, title: "Message undeliverable", error_data: { details: "Not on WhatsApp" } }],
                  },
                  { id: "wamid.3", status: "deleted" },
                  { status: "read" },
                ],
                messages: [{ id: "in.1", type: "text" }],
              },
            },
          ],
        },
      ],
    });
    expect(parsed.inboundCount).toBe(1);
    expect(parsed.statuses).toEqual([
      { messageId: "wamid.1", status: "delivered", at: "2025-09-30T08:00:00.000Z", errorCode: null, errorReason: null },
      { messageId: "wamid.2", status: "failed", at: "2025-09-30T08:01:00.000Z", errorCode: "131026", errorReason: "Not on WhatsApp" },
    ]);
  });

  it("is empty, not an error, for anything unrecognised", () => {
    expect(parseWhatsAppWebhook(null)).toEqual({ statuses: [], inboundCount: 0 });
    expect(parseWhatsAppWebhook({ entry: "x" })).toEqual({ statuses: [], inboundCount: 0 });
  });
});
