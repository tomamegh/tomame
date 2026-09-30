import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildTemplatePayload,
  classifyMetaError,
  sanitiseParam,
  sendTemplateMessage,
} from "../client";
import { normaliseWhatsAppPhone } from "../phone";
import type { WhatsAppConfig } from "../config";

const config: WhatsAppConfig = {
  accessToken: "EAAG-test",
  phoneNumberId: "1234567890",
  apiVersion: "v24.0",
  apiBaseUrl: "https://graph.example.test",
};

const message = {
  to: "233244123456",
  template: "tomame_order_paid",
  languageCode: "en",
  bodyParams: ["Ama", "Nike Air Max 90"],
  buttonUrlParam: "/app/orders/abc",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("normaliseWhatsAppPhone", () => {
  it.each([
    ["024 412 3456", "233244123456"],
    ["0244123456", "233244123456"],
    ["+233 24 412 3456", "233244123456"],
    ["233244123456", "233244123456"],
    ["00233244123456", "233244123456"],
    ["+233 0244123456", "233244123456"],
    ["(024) 412-3456", "233244123456"],
    ["+44 7700 900123", "447700900123"],
    ["001 202 555 0143", "12025550143"],
  ])("%s → %s", (raw, expected) => {
    expect(normaliseWhatsAppPhone(raw)).toBe(expected);
  });

  it.each([null, "", "   ", "12345", "0044123", "+233 12 34", "+abc", "0024412345"])("rejects %s", (raw) => {
    expect(normaliseWhatsAppPhone(raw)).toBeNull();
  });
});

describe("buildTemplatePayload", () => {
  it("builds a Cloud API template message with body and URL-button components", () => {
    expect(buildTemplatePayload(message)).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "233244123456",
      type: "template",
      template: {
        name: "tomame_order_paid",
        language: { code: "en" },
        components: [
          { type: "body", parameters: [{ type: "text", text: "Ama" }, { type: "text", text: "Nike Air Max 90" }] },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "app/orders/abc" }] },
        ],
      },
    });
  });

  it("omits the button component when there is no suffix", () => {
    const payload = buildTemplatePayload({ ...message, buttonUrlParam: null }) as { template: { components: unknown[] } };
    expect(payload.template.components).toHaveLength(1);
  });

  it("flattens parameters Meta would reject", () => {
    expect(sanitiseParam("Line one\n\tline    two  ")).toBe("Line one line two");
    expect(sanitiseParam("   ")).toBe("-");
    expect(sanitiseParam("x".repeat(300))).toHaveLength(200);
  });
});

describe("classifyMetaError", () => {
  it.each([130429, 131000, 131016, 131056, 80007])("%i is retryable", (code) => {
    expect(classifyMetaError(code, 400).retryable).toBe(true);
  });

  it.each([131026, 131047, 131051, 470, 132001, 190])("%i is permanent", (code) => {
    expect(classifyMetaError(code, 400).retryable).toBe(false);
  });

  it("names the undeliverable case", () => {
    expect(classifyMetaError(131026, 400).reason).toMatch(/not on WhatsApp/);
  });

  it("falls back on the HTTP status for an unknown code", () => {
    expect(classifyMetaError(null, 503).retryable).toBe(true);
    expect(classifyMetaError(null, 429).retryable).toBe(true);
    expect(classifyMetaError(999999, 400).retryable).toBe(false);
  });
});

describe("sendTemplateMessage", () => {
  it("POSTs to /<version>/<phone id>/messages with a bearer token and returns the wamid", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { messages: [{ id: "wamid.ABC" }] }));
    const result = await sendTemplateMessage(config, message, fetchImpl as unknown as typeof fetch);

    expect(result).toEqual({ ok: true, messageId: "wamid.ABC" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.example.test/v24.0/1234567890/messages");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer EAAG-test");
    expect(JSON.parse(init.body as string).template.name).toBe("tomame_order_paid");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("maps a permanent Meta error", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(400, { error: { code: 131026, message: "Message undeliverable" } }),
    );
    const result = await sendTemplateMessage(config, message, fetchImpl as unknown as typeof fetch);
    expect(result).toMatchObject({ ok: false, retryable: false, code: "131026" });
  });

  it("maps a rate limit as retryable", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(429, { error: { code: 130429, message: "Rate limit hit" } }));
    const result = await sendTemplateMessage(config, message, fetchImpl as unknown as typeof fetch);
    expect(result).toMatchObject({ ok: false, retryable: true, code: "130429" });
  });

  it("treats a network failure and a timeout as retryable", async () => {
    const network = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await sendTemplateMessage(config, message, network as unknown as typeof fetch)).toMatchObject({
      ok: false,
      retryable: true,
      code: "network",
    });

    const timeout = vi.fn(async () => {
      throw new DOMException("The operation timed out", "TimeoutError");
    });
    expect(await sendTemplateMessage(config, message, timeout as unknown as typeof fetch)).toMatchObject({
      ok: false,
      retryable: true,
      code: "timeout",
    });
  });

  it("retries a 200 that carries no message id", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {}));
    expect(await sendTemplateMessage(config, message, fetchImpl as unknown as typeof fetch)).toMatchObject({
      ok: false,
      retryable: true,
    });
  });
});
