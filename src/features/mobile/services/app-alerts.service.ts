import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getBag } from "@/features/bag/services/bag.service";
import { loadHomeOrders } from "@/features/app-home/services/home.service";
import { listUserNotifications } from "@/features/notifications/services/notifications.service";
import type { PlatformUser } from "@/features/users/types";
import { buildAppAlerts, buildAppReminders, type AppAlert, type AppReminder } from "../alerts";

/** The reminders the phone should have scheduled right now, from the bag and the moving orders. */
export async function listAppReminders(user: PlatformUser, sessionId: string | null): Promise<AppReminder[]> {
  const client = await createClient();
  const [bag, orders] = await Promise.all([getBag({ userId: user.id, sessionId }), loadHomeOrders(client, user.id)]);
  return buildAppReminders({ bag, orders });
}

/** The customer's news since `since`, for the app's background check. */
export async function listAppAlertsSince(user: PlatformUser, since: Date): Promise<{ alerts: AppAlert[]; now: string }> {
  const now = new Date().toISOString();
  const { notifications } = await listUserNotifications(user);
  return { alerts: buildAppAlerts(notifications, since), now };
}
