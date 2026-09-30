import "server-only";

import type { WhatsAppConfig } from "./config";

/**
 * Meta WhatsApp Cloud API — template messages only.
 *
 * Every Tomame message is business-initiated (we write first, about an order),
 * and outside a 24-hour customer-service window WhatsApp only delivers
 * pre-approved TEMPLATES. So this client sends nothing else: no free text, no
 * session messages. The template set lives in `templates.ts`; what must be
 * submitted to Meta is in docs/whatsapp-templates.md.
 *
 * Never throws. A result says whether Meta accepted the message and, when it
 * did not, whether trying again could help — the dispatcher's retry decision.
 */

export interface TemplateMessage {
  /** E.164 digits without '+', from `normaliseWhatsAppPhone`. */
  to: string;
  template: string;
  languageCode: string;
  /** Body placeholders {{1}}…{{n}}, in order. */
  bodyParams: readonly string[];
  /** The dynamic suffix of a URL button (`{{1}}` in the button's URL), if the template has one. */
  buttonUrlParam?: string | null;
}

export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; retryable: boolean; code: string; reason: string };

export const WHATSAPP_TIMEOUT_MS = 10_000;

/**
 * Meta parameter rules: no newlines or tabs, no more than four consecutive
 * spaces, never empty. A product title scraped from a store breaks all three,
 * and Meta rejects the whole message (132000/131009) rather than trimming it.
 */
export function sanitiseParam(value: string, maxLength = 200): string {
  const flat = value.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  const capped = flat.length > maxLength ? `${flat.slice(0, maxLength - 1).trimEnd()}…` : flat;
  return capped || "-";
}

export function buildTemplatePayload(message: TemplateMessage): Record<string, unknown> {
  const components: Record<string, unknown>[] = [];
  if (message.bodyParams.length > 0) {
    components.push({
      type: "body",
      parameters: message.bodyParams.map((text) => ({ type: "text", text: sanitiseParam(text) })),
    });
  }
  if (message.buttonUrlParam) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      // The suffix is a path, not prose: no sanitising beyond the length cap Meta applies.
      parameters: [{ type: "text", text: message.buttonUrlParam.replace(/^\/+/, "") }],
    });
  }
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: message.to,
    type: "template",
    template: {
      name: message.template,
      language: { code: message.languageCode },
      ...(components.length > 0 ? { components } : {}),
    },
  };
}

/**
 * Meta error code → may a retry succeed?
 *
 * Retryable: throttling and Meta-side faults. Permanent: anything about the
 * recipient, the template or our account — sending again would fail the same
 * way (and repeated sends to an unreachable number hurt the number's quality
 * rating, which is what gets a WhatsApp Business number restricted).
 */
const RETRYABLE_CODES = new Set([
  1, // API unknown
  2, // API service temporarily unavailable
  4, // app-level rate limit
  80007, // WABA rate limit
  130429, // Cloud API throughput rate limit
  131000, // something went wrong
  131016, // service unavailable
  131048, // spam rate limit
  131056, // pair rate limit (too many to one number)
]);

const PERMANENT_REASONS: Record<number, string> = {
  470: "Outside the 24-hour window; a template is required",
  10: "App lacks permission for this phone number",
  190: "Access token expired or invalid",
  200: "App lacks permission",
  131005: "Access denied",
  131008: "A required template parameter is missing",
  131009: "A template parameter is invalid",
  131021: "Recipient cannot be the sender",
  131026: "Undeliverable: the number is not on WhatsApp or cannot receive this message",
  131031: "WhatsApp Business account is locked",
  131047: "Re-engagement required: more than 24 hours since the customer last replied",
  131049: "Meta chose not to deliver this message (ecosystem limit)",
  131051: "Unsupported message type",
  131052: "Media download failed",
  132000: "Template parameter count does not match",
  132001: "Template does not exist or is not approved in this language",
  132005: "Template text too long once filled",
  132007: "Template breaks WhatsApp policy",
  132012: "Template parameter format mismatch",
  132015: "Template is paused for low quality",
  132016: "Template is disabled",
  133010: "Phone number is not registered with the Cloud API",
};

export function classifyMetaError(
  code: number | null,
  httpStatus: number,
  message?: string,
): { retryable: boolean; reason: string } {
  if (code !== null && RETRYABLE_CODES.has(code)) {
    return { retryable: true, reason: message || "Rate limited or temporarily unavailable" };
  }
  if (code !== null && PERMANENT_REASONS[code]) {
    return { retryable: false, reason: PERMANENT_REASONS[code] };
  }
  if (httpStatus === 429 || httpStatus >= 500) {
    return { retryable: true, reason: message || `Meta answered HTTP ${httpStatus}` };
  }
  return { retryable: false, reason: message || `Meta answered HTTP ${httpStatus}` };
}

interface MetaErrorBody {
  error?: { code?: number; message?: string; error_data?: { details?: string } };
  messages?: { id?: string }[];
}

export async function sendTemplateMessage(
  config: WhatsAppConfig,
  message: TemplateMessage,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  const url = `${config.apiBaseUrl}/${config.apiVersion}/${encodeURIComponent(config.phoneNumberId)}/messages`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildTemplatePayload(message)),
      signal: AbortSignal.timeout(WHATSAPP_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return {
      ok: false,
      retryable: true,
      code: timedOut ? "timeout" : "network",
      reason: timedOut ? `No answer from Meta within ${WHATSAPP_TIMEOUT_MS / 1000}s` : "Could not reach Meta",
    };
  }

  let body: MetaErrorBody = {};
  try {
    body = (await response.json()) as MetaErrorBody;
  } catch {
    // An HTML error page from a proxy; the status code is all there is.
  }

  const messageId = body.messages?.[0]?.id;
  if (response.ok && messageId) return { ok: true, messageId };

  const code = typeof body.error?.code === "number" ? body.error.code : null;
  const detail = body.error?.error_data?.details ?? body.error?.message;
  const { retryable, reason } = classifyMetaError(code, response.status, detail);
  return {
    ok: false,
    retryable: response.ok ? true : retryable, // 200 without an id: Meta hiccup, try again
    code: code !== null ? String(code) : `http_${response.status}`,
    reason: response.ok ? "Meta accepted the call but returned no message id" : reason,
  };
}
