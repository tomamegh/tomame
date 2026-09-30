/**
 * Meta's webhook body, reduced to what Tomame acts on.
 *
 * Shape: `{ object: "whatsapp_business_account", entry: [{ changes: [{ field:
 * "messages", value: { statuses?: [...], messages?: [...] } }] }] }`. Statuses
 * are delivery receipts for messages we sent; `messages` are customers writing
 * to us, which we only count for now (nobody reads a WhatsApp inbox yet).
 * Parsed leniently: an unknown field is skipped, never a 400, because Meta
 * disables a webhook that keeps failing.
 */

export type WhatsAppCallbackStatus = "sent" | "delivered" | "read" | "failed";

export interface WhatsAppStatusUpdate {
  messageId: string;
  status: WhatsAppCallbackStatus;
  /** ISO time Meta stamped, or null when it sent none we could read. */
  at: string | null;
  errorCode: string | null;
  errorReason: string | null;
}

export interface ParsedWhatsAppWebhook {
  statuses: WhatsAppStatusUpdate[];
  inboundCount: number;
}

const STATUSES = new Set<WhatsAppCallbackStatus>(["sent", "delivered", "read", "failed"]);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function parseWhatsAppWebhook(body: unknown): ParsedWhatsAppWebhook {
  const out: ParsedWhatsAppWebhook = { statuses: [], inboundCount: 0 };
  if (!isObj(body)) return out;

  for (const entry of arr(body.entry)) {
    if (!isObj(entry)) continue;
    for (const change of arr(entry.changes)) {
      if (!isObj(change) || !isObj(change.value)) continue;
      const value = change.value;
      out.inboundCount += arr(value.messages).length;

      for (const s of arr(value.statuses)) {
        if (!isObj(s) || typeof s.id !== "string" || typeof s.status !== "string") continue;
        if (!STATUSES.has(s.status as WhatsAppCallbackStatus)) continue;
        const seconds = Number(s.timestamp);
        const firstError = arr(s.errors).find(isObj);
        const details = firstError && isObj(firstError.error_data) ? firstError.error_data.details : undefined;
        out.statuses.push({
          messageId: s.id,
          status: s.status as WhatsAppCallbackStatus,
          at: Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null,
          errorCode: firstError && firstError.code !== undefined ? String(firstError.code) : null,
          errorReason: firstError
            ? String(details ?? firstError.message ?? firstError.title ?? "Delivery failed").slice(0, 500)
            : null,
        });
      }
    }
  }
  return out;
}
