/**
 * Phase 1 WhatsApp (decision 4, 2026-11-20): until the stage templates are
 * approved by Meta, staff send each stage update themselves. For every stage an
 * order has reached, the admin order view offers "Send WhatsApp" — wa.me to the
 * customer's number with that stage's template already filled in — and a
 * "WhatsApp sent" tick that is recorded (who, when) and audited.
 *
 * The text is the automated sender's own: `stageMessage` + `renderTemplateBody`
 * over the same `WHATSAPP_TEMPLATES`, so a manual and an automated message can
 * never say different things.
 *
 * Pure: the page and the route both build from it.
 */

import { CUSTOMER_STAGE_NAMES, waMeHref } from "@/config/tracking-copy";
import { STAGE_RANK, reachedRank, type ShipmentStageKey, type StageEvent } from "@/features/shipments/stages";
import { greetingName, renderTemplateBody, stageMessage, type WhatsAppTemplateKey } from "@/lib/whatsapp/templates";

/** The stages a manual send exists for, in walking order. One per template. */
export const MANUAL_WHATSAPP_STAGES = [
  "paid",
  "purchased",
  "hub_received",
  "departed",
  "arrived_country",
  "out_for_delivery",
  "delivered",
] as const satisfies readonly ShipmentStageKey[];

export type ManualWhatsAppStage = (typeof MANUAL_WHATSAPP_STAGES)[number];

export function isManualWhatsAppStage(value: string): value is ManualWhatsAppStage {
  return (MANUAL_WHATSAPP_STAGES as readonly string[]).includes(value);
}

export interface ManualWhatsAppSend {
  stage: string;
  sent_at: string;
  sender_name: string | null;
}

export interface ManualWhatsAppEntry {
  stage: ManualWhatsAppStage;
  stageName: string;
  templateKey: WhatsAppTemplateKey;
  /** The message as the customer reads it. */
  text: string;
  /** wa.me with the text filled in. Null without a usable customer number. */
  href: string | null;
  sent: { at: string; by: string | null } | null;
}

export interface ManualWhatsAppInput {
  order: { id: string; order_no: string; status: string; product_name: string | null };
  customer: { firstName: string | null; phone: string | null };
  events: readonly StageEvent[];
  sends: readonly ManualWhatsAppSend[];
  /** The delivery area from the checkout snapshot, for "Out for delivery". */
  area: string | null;
}

/** The stages this order has reached, each with its filled-in message and sent state. */
export function manualWhatsAppEntries(input: ManualWhatsAppInput): ManualWhatsAppEntry[] {
  const rank = reachedRank(input.order.status, input.events);
  if (rank < 0) return [];
  const pickedUp = input.events.some((e) => e.kind === "ready_for_pickup");
  const first = greetingName(input.customer.firstName);

  const out: ManualWhatsAppEntry[] = [];
  for (const stage of MANUAL_WHATSAPP_STAGES) {
    if (STAGE_RANK[stage] > rank) continue;
    // A pickup order is never "out for delivery".
    if (stage === "out_for_delivery" && pickedUp && !input.events.some((e) => e.kind === "out_for_delivery")) continue;
    const at = input.events.find((e) => e.kind === (stage === "paid" ? "payment_received" : stage))?.occurred_at ?? null;
    const message = stageMessage({
      stage,
      orderId: input.order.id,
      orderNo: input.order.order_no,
      itemName: input.order.product_name?.trim() || "your item",
      at,
      area: input.area,
    });
    if (!message) continue;
    const text = renderTemplateBody(message.template, [first, ...message.params]);
    const sent = input.sends.find((s) => s.stage === stage);
    out.push({
      stage,
      stageName: CUSTOMER_STAGE_NAMES[stage],
      templateKey: message.template,
      text,
      href: waMeHref(input.customer.phone, text),
      sent: sent ? { at: sent.sent_at, by: sent.sender_name } : null,
    });
  }
  return out;
}

/** "East Legon" from a checkout snapshot: the door address's area or city, or the zone. */
export function deliveryArea(snapshot: Record<string, unknown> | null | undefined): string | null {
  if (!snapshot) return null;
  for (const key of ["area", "city", "zone_name"]) {
    const value = snapshot[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
