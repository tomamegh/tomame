import "server-only";

import { closeOpenBox, type ConsolidationBoxRow } from "@/db/queries/consolidation-boxes";
import { runBoxSchedule } from "@/db/queries/flight-departures";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { AUDIT_ACTOR_ROLES, AUDIT_ENTITY_TYPES } from "@/config/constants";
import { APIError } from "@/lib/auth/api-helpers";

/**
 * Staff actions on boxes (111, site brief Fix 9). A closed box keeps its
 * departure and contents: the bag packer only ever reuses open boxes, so new
 * lines go to a fresh box on the next departure.
 */
export async function closeBoxByStaff(adminId: string, id: string): Promise<ConsolidationBoxRow> {
  const box = await closeOpenBox(id, adminId);
  if (!box) throw new APIError(409, "That box is not open any more. Refresh the page.");
  await logAuditEvent({
    actorId: adminId,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    action: "box_closed",
    entityType: AUDIT_ENTITY_TYPES.CONSOLIDATION_BOX,
    entityId: id,
    metadata: { code: box.code, reason: "staff", departure_id: box.departure_id, departs_at: box.departs_at },
  });
  return box;
}

/** Run the schedule job now instead of waiting for the next 15-minute tick. */
export async function runBoxScheduleNow(adminId: string): Promise<Record<string, number>> {
  const summary = await runBoxSchedule();
  await logAuditEvent({
    actorId: adminId,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    action: "box_schedule_run",
    entityType: AUDIT_ENTITY_TYPES.CONSOLIDATION_BOX,
    entityId: null,
    metadata: summary,
  });
  return summary;
}
