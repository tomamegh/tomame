import "server-only";

import { AUDIT_ENTITY_TYPES } from "@/config/constants";
import { getAdminOrder } from "@/db/queries/admin-orders";
import { listOrderEvents } from "@/db/queries/order-events";
import {
  clearOrderWhatsAppFailed,
  insertOrderWhatsAppSend,
  listOrderWhatsAppSends,
} from "@/db/queries/order-whatsapp";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import type { PlatformUser } from "@/features/users/types";
import { APIError } from "@/lib/auth/api-helpers";
import { createAdminClient } from "@/lib/supabase/admin";

import { MANUAL_WHATSAPP_STAGES, isManualWhatsAppStage, manualWhatsAppEntries } from "../manual-whatsapp";

/**
 * Record that staff sent a stage's WhatsApp by hand (Phase 1, 104). One tick
 * per order and stage; a second tick for the same stage is answered as already
 * recorded, not as an error. Clears the order's failed-send flag, since the
 * customer has now been messaged. Every tick writes an `audit_logs` row.
 */
export async function recordManualWhatsAppSend(
  user: PlatformUser,
  orderId: string,
  stage: string,
): Promise<{ recorded: boolean; sent_at: string | null }> {
  if (!isManualWhatsAppStage(stage)) {
    throw new APIError(400, `Unknown stage. Use one of: ${MANUAL_WHATSAPP_STAGES.join(", ")}`);
  }
  const order = await getAdminOrder(orderId);
  if (!order) throw new APIError(404, "Order not found");

  // The tick is for a stage the order has actually reached.
  const events = await listOrderEvents(createAdminClient(), order.id, { customerVisibleOnly: false });
  const reached = manualWhatsAppEntries({
    order,
    customer: { firstName: null, phone: null },
    events,
    sends: [],
    area: null,
  });
  const entry = reached.find((e) => e.stage === stage);
  if (!entry) throw new APIError(409, "This order has not reached that stage yet.");

  const row = await insertOrderWhatsAppSend({
    order_id: order.id,
    stage,
    template_key: entry.templateKey,
    sent_by: user.id,
  });
  if (!row) {
    const existing = (await listOrderWhatsAppSends(order.id)).find((s) => s.stage === stage);
    return { recorded: false, sent_at: existing?.sent_at ?? null };
  }

  await clearOrderWhatsAppFailed(order.id);
  await logAuditEvent({
    actorId: user.id,
    actorRole: "admin",
    action: "whatsapp_manual_sent",
    entityType: AUDIT_ENTITY_TYPES.ORDER,
    entityId: order.id,
    metadata: { order_no: order.order_no, stage, template: entry.templateKey },
  });
  return { recorded: true, sent_at: row.sent_at };
}
