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
    status: "success" | "failed" | "abandoned";
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
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string
): boolean {
  const hash = crypto
    .createHmac("sha512", env.paystack.secretKey)
    .update(payload)
    .digest("hex");
  return hash === signature;
}
