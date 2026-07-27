import crypto from "crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Hubtel Merchant Account — Receive Money Prompt (RMP).
 *
 * Unlike a hosted-checkout redirect, RMP pushes a PIN prompt straight to the
 * customer's mobile money wallet. The initiate call only *accepts* the request
 * (ResponseCode 0001); the money has not moved yet. Settlement is confirmed
 * either by Hubtel's callback or by polling the Transaction Status Check API.
 *
 * Hubtel does not sign its callbacks, so the status check is the only
 * trustworthy source of truth. Never mark a payment successful from a
 * callback body alone.
 */

/** Mobile money networks Hubtel bills through, keyed by the API `Channel` value. */
export const HUBTEL_CHANNELS = {
  MTN: "mtn-gh",
  TELECEL: "vodafone-gh",
  AIRTELTIGO: "tigo-gh",
} as const;

export type HubtelChannel =
  (typeof HUBTEL_CHANNELS)[keyof typeof HUBTEL_CHANNELS];

export const HUBTEL_CHANNEL_LABELS: Record<HubtelChannel, string> = {
  "mtn-gh": "MTN Mobile Money",
  "vodafone-gh": "Telecel Cash",
  "tigo-gh": "AirtelTigo Money",
};

/** Hubtel's response codes. Anything else is a hard failure. */
const RESPONSE_CODE = {
  /** Transaction completed successfully. */
  SUCCESS: "0000",
  /** Accepted for processing — the prompt is on the customer's phone. */
  PENDING: "0001",
  /** Also used for "still processing" on the status endpoint. */
  PROCESSING: "0005",
} as const;

export type HubtelPaymentState = "success" | "pending" | "failed";

// ── Wire types ────────────────────────────────────────────────────────────────

interface ReceiveMoneyParams {
  /** Amount in GHS (decimal, e.g. 250.75) — NOT pesewas. */
  amount: number;
  customerName: string;
  customerEmail: string;
  /** Local 10-digit MoMo number, e.g. 0244000000. */
  customerMsisdn: string;
  channel: HubtelChannel;
  description: string;
  clientReference: string;
  primaryCallbackUrl: string;
}

interface ReceiveMoneyResponse {
  ResponseCode: string;
  Message?: string;
  Data?: {
    TransactionId?: string;
    ClientReference?: string;
    Description?: string;
    Amount?: number;
    Charges?: number;
    AmountAfterCharges?: number;
    AmountCharged?: number;
    ExternalTransactionId?: string;
  } | null;
}

/** Transaction Status Check returns camelCase keys, unlike the RMP endpoint. */
interface TransactionStatusResponse {
  message?: string;
  responseCode: string;
  data?: {
    date?: string;
    status?: string;
    transactionId?: string;
    externalTransactionId?: string;
    paymentMethod?: string;
    clientReference?: string;
    currencyCode?: string | null;
    amount?: number;
    charges?: number;
    amountAfterCharges?: number;
    isFulfilled?: boolean | null;
  } | null;
}

export interface HubtelChargeResult {
  state: HubtelPaymentState;
  responseCode: string;
  message: string;
  transactionId: string | null;
  externalTransactionId: string | null;
  /** GHS decimal as reported by Hubtel, when present. */
  amount: number | null;
  raw: Record<string, unknown>;
}

// ── Transport ─────────────────────────────────────────────────────────────────

function authHeader(): string {
  const token = Buffer.from(
    `${env.hubtel.apiId}:${env.hubtel.apiKey}`,
  ).toString("base64");
  return `Basic ${token}`;
}

/**
 * @param idempotencyKey Sent so a retried POST cannot create a second charge.
 *   Hubtel's own de-duplication key is `ClientReference` in the body — this
 *   header is the belt to that braces, and is ignored harmlessly if unsupported.
 */
async function hubtelFetch<T>(
  url: string,
  options: RequestInit = {},
  idempotencyKey?: string,
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(idempotencyKey
        ? {
            "Idempotency-Key": idempotencyKey,
            "X-Idempotency-Key": idempotencyKey,
          }
        : {}),
      ...options.headers,
    },
  });

  const text = await res.text();

  // Hubtel answers 200/202 on accept and 4xx on rejection, but a rejection body
  // still carries a ResponseCode worth surfacing — so parse before throwing.
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    logger.error("Hubtel returned a non-JSON response", {
      url,
      status: res.status,
      body: text.slice(0, 500),
    });
    throw new Error(`Hubtel API error: ${res.status}`);
  }

  if (!res.ok) {
    logger.error("Hubtel API error", { url, status: res.status, body });
    const code = (body as { ResponseCode?: string; responseCode?: string } | null);
    const responseCode = code?.ResponseCode ?? code?.responseCode;
    if (responseCode) {
      // A coded rejection is a business outcome, not a transport failure.
      return body as T;
    }
    throw new Error(`Hubtel API error: ${res.status}`);
  }

  return body as T;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalise a Ghanaian MoMo number to the local 10-digit form Hubtel expects
 * (0XXXXXXXXX). Accepts +233…, 233…, and 0… inputs. Returns null if it is not
 * a plausible Ghanaian mobile number.
 */
export function normalizeMsisdn(input: string): string | null {
  const digits = input.replace(/\D/g, "");

  if (digits.length === 12 && digits.startsWith("233")) {
    return `0${digits.slice(3)}`;
  }
  if (digits.length === 9) {
    return `0${digits}`;
  }
  if (digits.length === 10 && digits.startsWith("0")) {
    return digits;
  }
  return null;
}

/** Convert the pesewas we store in the DB to the GHS decimal Hubtel bills in. */
export function pesewasToGhs(pesewas: number): number {
  return Math.round(pesewas) / 100;
}

/** Generate a unique payment reference: TOM_<timestamp>_<random>. */
export function generatePaymentReference(): string {
  const timestamp = Date.now();
  const random = crypto.randomBytes(6).toString("hex");
  return `TOM_${timestamp}_${random}`;
}

/** Constant-time compare for the callback URL secret. */
export function isValidCallbackSecret(candidate: string): boolean {
  const expected = env.hubtel.callbackSecret;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function stateFromResponseCode(code: string): HubtelPaymentState {
  if (code === RESPONSE_CODE.SUCCESS) return "success";
  if (code === RESPONSE_CODE.PENDING || code === RESPONSE_CODE.PROCESSING) {
    return "pending";
  }
  return "failed";
}

// ── API calls ─────────────────────────────────────────────────────────────────

/**
 * Send a mobile money PIN prompt to the customer's phone.
 *
 * A `pending` result is the normal happy path — it means the prompt was
 * delivered, not that the payment succeeded.
 */
export async function receiveMobileMoney(
  params: ReceiveMoneyParams,
): Promise<HubtelChargeResult> {
  const url =
    `${env.hubtel.rmpBaseUrl}/merchantaccount/merchants/` +
    `${encodeURIComponent(env.hubtel.merchantAccountNumber)}/receive/mobilemoney`;

  const response = await hubtelFetch<ReceiveMoneyResponse>(
    url,
    {
      method: "POST",
      body: JSON.stringify({
        CustomerName: params.customerName,
        CustomerEmail: params.customerEmail,
        CustomerMsisdn: params.customerMsisdn,
        Channel: params.channel,
        Amount: params.amount,
        PrimaryCallbackUrl: params.primaryCallbackUrl,
        Description: params.description,
        ClientReference: params.clientReference,
      }),
    },
    // The reference is unique per payment row, so a retry of this exact charge
    // carries the same key while a genuine new attempt carries a fresh one.
    params.clientReference,
  );

  const code = response?.ResponseCode ?? "";

  return {
    state: stateFromResponseCode(code),
    responseCode: code,
    message: response?.Message ?? "",
    transactionId: response?.Data?.TransactionId ?? null,
    externalTransactionId: response?.Data?.ExternalTransactionId ?? null,
    amount: response?.Data?.Amount ?? null,
    raw: (response ?? {}) as unknown as Record<string, unknown>,
  };
}

/**
 * Authoritative check of where a transaction actually stands.
 *
 * This is the only call whose verdict may be written to the payments table.
 * A transaction is successful only when Hubtel reports status "Paid".
 */
export async function getTransactionStatus(
  clientReference: string,
): Promise<HubtelChargeResult> {
  const url =
    `${env.hubtel.statusBaseUrl}/transactions/` +
    `${encodeURIComponent(env.hubtel.merchantAccountNumber)}/status` +
    `?clientReference=${encodeURIComponent(clientReference)}`;

  const response = await hubtelFetch<TransactionStatusResponse>(url);

  const code = response?.responseCode ?? "";
  const reported = (response?.data?.status ?? "").toLowerCase();

  let state: HubtelPaymentState;
  if (reported === "paid") {
    state = "success";
  } else if (reported === "pending" || stateFromResponseCode(code) === "pending") {
    state = "pending";
  } else {
    // "Unpaid", "Refunded", "Failed", an unknown status, or a not-found code.
    state = "failed";
  }

  return {
    state,
    responseCode: code,
    message: response?.message ?? "",
    transactionId: response?.data?.transactionId ?? null,
    externalTransactionId: response?.data?.externalTransactionId ?? null,
    amount: response?.data?.amount ?? null,
    raw: (response ?? {}) as unknown as Record<string, unknown>,
  };
}
