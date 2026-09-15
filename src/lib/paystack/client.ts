import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import crypto from "crypto";

const PAYSTACK_BASE_URL = "https://api.paystack.co";

interface PaystackInitializeParams {
  email: string;
  /** Amount in pesewas (GHS × 100) */
  amount: number;
  reference: string;
  callbackUrl: string;
  channels?: string[];
  /** Echoed back on verify and in the dashboard — the order/group ids live here. */
  metadata?: Record<string, unknown>;
}

interface PaystackInitializeResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data: {
    id: number;
    /**
     * Paystack's own vocabulary is wider than the three everyone remembers:
     * `success`, `failed`, `abandoned`, `reversed`, `ongoing`, `pending`,
     * `processing`, `queued`. Callers compare against the ones they act on and
     * treat anything else as "not settled yet".
     */
    status: string;
    reference: string;
    amount: number;
    currency: string;
    channel: string;
    paid_at: string | null;
    customer: { email: string };
    metadata: Record<string, unknown> | null;
  };
}

async function paystackFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.paystack.secretKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    logger.error("Paystack API error", {
      path,
      status: res.status,
      body,
    });
    throw new Error(`Paystack API error: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Initialize a Paystack transaction.
 * Returns the authorization URL the customer should be redirected to.
 */
export async function initializeTransaction(
  params: PaystackInitializeParams
): Promise<PaystackInitializeResponse> {
  return paystackFetch<PaystackInitializeResponse>(
    "/transaction/initialize",
    {
      method: "POST",
      body: JSON.stringify({
        email: params.email,
        amount: params.amount,
        reference: params.reference,
        callback_url: params.callbackUrl,
        channels: params.channels ?? ["card", "mobile_money"],
        ...(params.metadata ? { metadata: params.metadata } : {}),
      }),
    }
  );
}

/**
 * Verify a Paystack transaction by reference.
 * Always call this server-side — never trust client-provided payment status.
 */
export async function verifyTransaction(
  reference: string
): Promise<PaystackVerifyResponse> {
  return paystackFetch<PaystackVerifyResponse>(
    `/transaction/verify/${encodeURIComponent(reference)}`
  );
}

/**
 * Generate a unique payment reference: TOM_<timestamp>_<random>
 */
export function generatePaymentReference(): string {
  const timestamp = Date.now();
  const random = crypto.randomBytes(6).toString("hex");
  return `TOM_${timestamp}_${random}`;
}

/**
 * Verify Paystack webhook signature (HMAC-SHA512).
 * Returns true if the signature is valid.
 *
 * `payload` MUST be the raw request body exactly as it arrived — the string
 * from `request.text()`, never a re-serialized `JSON.stringify(parsed)`. Paystack
 * signs the bytes it sent, and re-serializing changes key order and whitespace,
 * so every delivery would fail the check. `webhook/paystack/route.ts` reads the
 * text once and parses that same string afterwards, in that order, for this
 * reason.
 *
 * COMPARED IN CONSTANT TIME, not with `===`. The old spelling returned on the
 * first differing character, so how long the answer took leaked how much of a
 * guessed prefix was right — the classic way to forge a MAC one byte at a time.
 * It is a narrow hole over a network against HMAC-SHA512, and it was logged as
 * W6 in `docs/SECURITY-REVIEW-2026-09-14.md` rather than exploited, but there is
 * no reason to keep a signature check that answers faster when it is closer.
 *
 * The length guard is not a formality: `timingSafeEqual` THROWS on buffers of
 * unequal length. It also covers junk input — `Buffer.from(x, "hex")` stops at
 * the first non-hex character rather than erroring, so a malformed header simply
 * decodes short and is refused here.
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string
): boolean {
  const hash = crypto
    .createHmac("sha512", env.paystack.secretKey)
    .update(payload)
    .digest("hex");

  const expected = Buffer.from(hash, "hex");
  const actual = Buffer.from(signature, "hex");
  if (expected.length !== actual.length) return false;

  return crypto.timingSafeEqual(expected, actual);
}
