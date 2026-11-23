import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

// Kept in sync with the vi.mock factory below by hand — vi.mock is hoisted
// above every top-level binding, so the factory cannot close over this.
const SECRET_KEY = "sk_test_paystack_secret";

vi.mock("@/lib/env", () => ({
  env: {
    paystack: { secretKey: "sk_test_paystack_secret", publicKey: "pk_test_public" },
    app: { url: "https://tomame.test" },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  initializeTransaction,
  verifyTransaction,
  generatePaymentReference,
  verifyWebhookSignature,
  chargeMobileMoney,
  submitChargeOtp,
} from "@/lib/paystack/client";
import { paymentCallbackSchema } from "@/features/payments/schema";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function errorResponse(status: number, body = "nope") {
  return {
    ok: false,
    status,
    text: async () => body,
  } as unknown as Response;
}

/** The single request the client made, with the shape the assertions need. */
function onlyRequest() {
  const call = fetchMock.mock.calls.at(0);
  if (!call) throw new Error("expected fetch to have been called");
  const [url, init] = call as [string, RequestInit];
  return {
    url,
    method: init.method,
    headers: init.headers as Record<string, string>,
    body: init.body as string | undefined,
  };
}

// ── R8: webhook signature ────────────────────────────────────────────────────

describe("verifyWebhookSignature", () => {
  const payload = JSON.stringify({ event: "charge.success", data: { reference: "TOM_1_ab" } });

  function sign(body: string, key = SECRET_KEY) {
    return crypto.createHmac("sha512", key).update(body).digest("hex");
  }

  it("accepts a signature produced with the Paystack secret over the exact body", () => {
    expect(verifyWebhookSignature(payload, sign(payload))).toBe(true);
  });

  it("rejects a signature over a different body", () => {
    const tampered = payload.replace("charge.success", "charge.failed");
    expect(verifyWebhookSignature(tampered, sign(payload))).toBe(false);
  });

  it("rejects a body whose amount was altered after signing", () => {
    const original = JSON.stringify({ event: "charge.success", data: { amount: 10_000 } });
    const altered = JSON.stringify({ event: "charge.success", data: { amount: 1 } });
    expect(verifyWebhookSignature(altered, sign(original))).toBe(false);
  });

  it("rejects a signature produced with the wrong key", () => {
    expect(verifyWebhookSignature(payload, sign(payload, "sk_test_attacker"))).toBe(false);
  });

  it("rejects empty and malformed signatures", () => {
    expect(verifyWebhookSignature(payload, "")).toBe(false);
    expect(verifyWebhookSignature(payload, "not-a-hex-digest")).toBe(false);
  });
});

// ── Reference generation ─────────────────────────────────────────────────────

describe("generatePaymentReference", () => {
  it("produces a reference the callback validator accepts", () => {
    // The generator and the callback schema have to agree, or every return from
    // Paystack is rejected before it is ever looked up.
    const reference = generatePaymentReference();
    expect(paymentCallbackSchema.safeParse({ reference }).success).toBe(true);
  });

  it("does not repeat across rapid successive calls", () => {
    const refs = new Set(Array.from({ length: 200 }, () => generatePaymentReference()));
    expect(refs.size).toBe(200);
  });
});

// ── Transport ────────────────────────────────────────────────────────────────

describe("initializeTransaction", () => {
  it("posts the pesewas amount, reference and callback to Paystack with the secret key", async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        status: true,
        message: "ok",
        data: { authorization_url: "https://checkout.paystack.com/abc", access_code: "abc", reference: "TOM_1_ab" },
      }),
    );

    await initializeTransaction({
      email: "customer@example.com",
      amount: 125_000,
      reference: "TOM_1_ab",
      callbackUrl: "https://tomame.test/api/payments/callback",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = onlyRequest();
    expect(request.url).toBe("https://api.paystack.co/transaction/initialize");
    expect(request.method).toBe("POST");
    expect(request.headers.Authorization).toBe(`Bearer ${SECRET_KEY}`);

    expect(JSON.parse(request.body ?? "{}")).toEqual({
      email: "customer@example.com",
      amount: 125_000,
      reference: "TOM_1_ab",
      callback_url: "https://tomame.test/api/payments/callback",
      channels: ["card", "mobile_money"],
    });
  });

  it("throws when Paystack rejects the request", async () => {
    fetchMock.mockResolvedValue(errorResponse(401, "invalid key"));

    await expect(
      initializeTransaction({
        email: "customer@example.com",
        amount: 100,
        reference: "TOM_1_ab",
        callbackUrl: "https://tomame.test/api/payments/callback",
      }),
    ).rejects.toThrow(/401/);
  });
});

describe("verifyTransaction", () => {
  it("reads the transaction back by reference, url-encoded", async () => {
    fetchMock.mockResolvedValue(
      okResponse({ status: true, message: "ok", data: { status: "success" } }),
    );

    await verifyTransaction("TOM_1_a b/c");

    const request = onlyRequest();
    expect(request.url).toBe("https://api.paystack.co/transaction/verify/TOM_1_a%20b%2Fc");
    expect(request.headers.Authorization).toBe(`Bearer ${SECRET_KEY}`);
  });

  it("throws when Paystack is unavailable, so the caller can retry", async () => {
    fetchMock.mockResolvedValue(errorResponse(503));
    await expect(verifyTransaction("TOM_1_ab")).rejects.toThrow(/503/);
  });
});

// ── Mobile Money charge (Seamless Roadmap, Initiative 1) ────────────────────

describe("chargeMobileMoney", () => {
  function jsonResponse(status: number, body: unknown) {
    return { ok: status < 400, status, json: async () => body } as unknown as Response;
  }

  it("posts the MoMo charge in GHS with the phone and provider", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { status: true, data: { status: "pay_offline", reference: "TOM_1_ab", display_text: "Approve on your phone" } }),
    );
    const result = await chargeMobileMoney({ email: "a@b.com", amount: 80299, reference: "TOM_1_ab", phone: "0551234987", provider: "mtn" });

    const req = onlyRequest();
    expect(req.url).toBe("https://api.paystack.co/charge");
    expect(JSON.parse(req.body!)).toEqual({
      email: "a@b.com",
      amount: 80299,
      currency: "GHS",
      reference: "TOM_1_ab",
      mobile_money: { phone: "0551234987", provider: "mtn" },
    });
    expect(result).toEqual({ status: "pay_offline", reference: "TOM_1_ab", displayText: "Approve on your phone", message: null });
  });

  it("returns a decline (HTTP 400 with a failed charge) instead of throwing", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { status: false, message: "Charge attempted", data: { status: "failed", reference: "TOM_1_ab", message: "Declined" } }),
    );
    const result = await chargeMobileMoney({ email: "a@b.com", amount: 100, reference: "TOM_1_ab", phone: "0241234567", provider: "mtn" });
    expect(result.status).toBe("failed");
    expect(result.message).toBe("Declined");
  });

  it("throws when the answer carries no charge at all (validation error, outage)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { status: false, message: "Please pass provider" }));
    await expect(
      chargeMobileMoney({ email: "a@b.com", amount: 100, reference: "TOM_1_ab", phone: "0241234567", provider: "mtn" }),
    ).rejects.toThrow("Paystack API error: 400");
  });

  it("submits a network OTP against the same reference", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: true, data: { status: "pay_offline", reference: "TOM_1_ab" } }));
    await submitChargeOtp("TOM_1_ab", "123456");
    const req = onlyRequest();
    expect(req.url).toBe("https://api.paystack.co/charge/submit_otp");
    expect(JSON.parse(req.body!)).toEqual({ otp: "123456", reference: "TOM_1_ab" });
  });
});
