import "server-only";

import {
  audienceSize,
  countReceipts,
  findUserIdByEmail,
  hasPaidOrder,
  insertAnnouncement,
  listAnnouncements,
  listLiveAnnouncementsFor,
  listReceiptsFor,
  upsertReceipt,
  withdrawAnnouncementRow,
  type AnnouncementAudience,
} from "@/db/queries/announcements";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { AUDIT_ACTOR_ROLES, AUDIT_ENTITY_TYPES } from "@/config/constants";
import { APIError } from "@/lib/auth/api-helpers";

import type { AnnouncementInput } from "../schema";
import type { AdminAnnouncement, CustomerAnnouncement } from "../types";

/**
 * The communication center (119). Admin sends a message to every customer, to
 * customers who have paid for an order, or to one customer; it shows in-app as
 * a pop-up on their next visit and in their bell until dismissed. Never emailed.
 */

/** A message older than this stops showing even if nobody dismissed it. */
const SHOW_FOR_DAYS = 30;

export const AUDIENCE_LABEL: Record<AnnouncementAudience, string> = {
  all: "Every customer",
  ordered: "Customers who have paid for an order",
  one: "One customer",
};

export async function sendAnnouncement(adminId: string, input: AnnouncementInput): Promise<AdminAnnouncement> {
  let target: string | null = null;
  if (input.audience === "one") {
    target = await findUserIdByEmail(input.email ?? "");
    if (!target) throw new APIError(404, "No customer signed up with that email");
  }
  const row = await insertAnnouncement({
    title: input.title,
    body: input.body,
    link_href: input.link_href || null,
    link_label: input.link_href ? input.link_label || null : null,
    audience: input.audience,
    target_user_id: target,
    created_by: adminId,
    expires_at: input.expires_in_days ? new Date(Date.now() + input.expires_in_days * 86_400_000).toISOString() : null,
  });
  const reach = await audienceSize(row.audience);
  await logAuditEvent({
    actorId: adminId,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    action: "announcement_sent",
    entityType: AUDIT_ENTITY_TYPES.ANNOUNCEMENT,
    entityId: row.id,
    metadata: { audience: row.audience, target_user_id: target, title: row.title, reach },
  });
  return { ...toAdmin(row), reach, seen: 0, dismissed: 0 };
}

export async function withdrawAnnouncement(adminId: string, id: string): Promise<void> {
  const row = await withdrawAnnouncementRow(id);
  if (!row) throw new APIError(409, "That message is already withdrawn");
  await logAuditEvent({
    actorId: adminId,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    action: "announcement_withdrawn",
    entityType: AUDIT_ENTITY_TYPES.ANNOUNCEMENT,
    entityId: id,
    metadata: { title: row.title },
  });
}

export async function listAdminAnnouncements(): Promise<AdminAnnouncement[]> {
  const rows = await listAnnouncements();
  const [counts, reachAll, reachOrdered] = await Promise.all([countReceipts(rows.map((r) => r.id)), audienceSize("all"), audienceSize("ordered")]);
  return rows.map((row) => ({
    ...toAdmin(row),
    reach: row.audience === "all" ? reachAll : row.audience === "ordered" ? reachOrdered : 1,
    seen: counts.get(row.id)?.seen ?? 0,
    dismissed: counts.get(row.id)?.dismissed ?? 0,
  }));
}

/** The messages a signed-in customer should see now, newest first, minus the ones they dismissed. */
export async function announcementsFor(userId: string): Promise<CustomerAnnouncement[]> {
  const since = new Date(Date.now() - SHOW_FOR_DAYS * 86_400_000).toISOString();
  const live = await listLiveAnnouncementsFor(userId, since);
  if (live.length === 0) return [];
  const ordered = live.some((a) => a.audience === "ordered") ? await hasPaidOrder(userId) : false;
  const mine = live.filter((a) => a.audience === "all" || (a.audience === "ordered" && ordered) || (a.audience === "one" && a.target_user_id === userId));
  const receipts = await listReceiptsFor(userId, mine.map((a) => a.id));
  return mine
    .filter((a) => !receipts.get(a.id)?.dismissed_at)
    .map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      link_href: a.link_href,
      link_label: a.link_label,
      created_at: a.created_at,
      seen: receipts.has(a.id),
    }));
}

/** The pop-up was shown (it stays in the bell), or the customer dismissed it (gone). */
export async function recordAnnouncementReceipt(userId: string, id: string, dismissed: boolean): Promise<void> {
  const visible = await announcementsFor(userId);
  if (!visible.some((a) => a.id === id)) return;
  await upsertReceipt({ announcementId: id, userId, dismissed });
}

function toAdmin(row: Awaited<ReturnType<typeof listAnnouncements>>[number]): Omit<AdminAnnouncement, "reach" | "seen" | "dismissed"> {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    link_href: row.link_href,
    link_label: row.link_label,
    audience: row.audience,
    audience_label: AUDIENCE_LABEL[row.audience],
    status: row.status,
    created_at: row.created_at,
    expires_at: row.expires_at,
  };
}
