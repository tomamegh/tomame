import "server-only";

import { AUDIT_ENTITY_TYPES } from "@/config/constants";
import { getSiteSetting, updateSiteSettingValue } from "@/db/queries/admin-content";
import { listRecentStaffAlertSends, readSiteSettingValues, type StaffAlertSendRow } from "@/db/queries/staff-alerts";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { alertsEnabled, environmentLabel } from "@/features/ops/alert-recipients";
import { APIError } from "@/lib/auth/api-helpers";
import { logger } from "@/lib/logger";
import {
  STAFF_EVENTS_KEY,
  STAFF_RECIPIENTS_KEY,
  normaliseEvents,
  resolveStaffRecipients,
  type StaffAlertSettingsInput,
  type StaffEventToggles,
} from "./settings";

/** What /admin/notifications shows in its Staff notifications card. */
export interface StaffAlertSettingsView {
  recipients: string[];
  recipientsFrom: "env" | "setting" | "default";
  events: StaffEventToggles;
  enabled: boolean;
  environment: string | null;
  recentSends: StaffAlertSendRow[];
}

export async function getStaffAlertSettingsView(env: Record<string, string | undefined> = process.env): Promise<StaffAlertSettingsView> {
  const [settings, recentSends] = await Promise.all([
    readSiteSettingValues([STAFF_RECIPIENTS_KEY, STAFF_EVENTS_KEY]).catch((error: unknown) => {
      logger.warn("staff alerts: settings read failed", { error: error instanceof Error ? error.message : String(error) });
      return {} as Record<string, unknown>;
    }),
    listRecentStaffAlertSends(15).catch(() => [] as StaffAlertSendRow[]),
  ]);
  const { recipients, from } = resolveStaffRecipients(env.STAFF_ALERT_RECIPIENTS, settings[STAFF_RECIPIENTS_KEY]);
  return {
    recipients,
    recipientsFrom: from,
    events: normaliseEvents(settings[STAFF_EVENTS_KEY]),
    enabled: alertsEnabled(env),
    environment: environmentLabel(env),
    recentSends,
  };
}

/**
 * Replace the list and the toggles. Both rows exist from 087; a missing one is
 * a database that has not had the migration, answered 409 rather than created
 * unlabelled. Each changed row writes an audit entry with before and after.
 */
export async function updateStaffAlertSettings(
  input: StaffAlertSettingsInput,
  actor: { id: string; email: string | null },
): Promise<{ recipients: string[]; events: StaffEventToggles }> {
  const [currentRecipients, currentEvents] = await Promise.all([getSiteSetting(STAFF_RECIPIENTS_KEY), getSiteSetting(STAFF_EVENTS_KEY)]);
  if (!currentRecipients || !currentEvents) {
    throw new APIError(409, "Staff alert settings are missing. Apply migration 087 to this database.");
  }

  const writes: { key: string; previous: unknown; next: unknown }[] = [];
  if (JSON.stringify(currentRecipients.value) !== JSON.stringify(input.recipients)) {
    writes.push({ key: STAFF_RECIPIENTS_KEY, previous: currentRecipients.value, next: input.recipients });
  }
  if (JSON.stringify(normaliseEvents(currentEvents.value)) !== JSON.stringify(input.events)) {
    writes.push({ key: STAFF_EVENTS_KEY, previous: currentEvents.value, next: input.events });
  }

  for (const w of writes) {
    const updated = await updateSiteSettingValue(w.key, w.next, actor.id);
    if (!updated) throw new APIError(409, "Staff alert settings are missing. Apply migration 087 to this database.");
    await logAuditEvent({
      actorId: actor.id,
      actorRole: "admin",
      action: "staff_alert_settings_updated",
      entityType: AUDIT_ENTITY_TYPES.SITE_SETTING,
      entityId: null,
      metadata: { table: "site_settings", key: w.key, previousValue: w.previous, newValue: w.next, actorEmail: actor.email },
    });
  }

  return { recipients: input.recipients, events: input.events };
}
