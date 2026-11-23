import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/** Data access for the communication center (119). Service role; callers check who is asking. */

export type AnnouncementAudience = "all" | "ordered" | "one";

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  link_href: string | null;
  link_label: string | null;
  audience: AnnouncementAudience;
  target_user_id: string | null;
  status: "sent" | "withdrawn";
  created_by: string | null;
  created_at: string;
  withdrawn_at: string | null;
  expires_at: string | null;
}

const COLUMNS = "id, title, body, link_href, link_label, audience, target_user_id, status, created_by, created_at, withdrawn_at, expires_at";

export async function insertAnnouncement(input: Omit<AnnouncementRow, "id" | "status" | "created_at" | "withdrawn_at">): Promise<AnnouncementRow> {
  const { data, error } = await createAdminClient().from("announcements").insert(input).select(COLUMNS).single();
  if (error) throw new Error(`Failed to save the message: ${error.message}`);
  return data as AnnouncementRow;
}

export async function withdrawAnnouncementRow(id: string): Promise<AnnouncementRow | null> {
  const { data, error } = await createAdminClient()
    .from("announcements")
    .update({ status: "withdrawn", withdrawn_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "sent")
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`Failed to withdraw the message: ${error.message}`);
  return (data as AnnouncementRow | null) ?? null;
}

export async function listAnnouncements(limit = 50): Promise<AnnouncementRow[]> {
  const { data, error } = await createAdminClient().from("announcements").select(COLUMNS).order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`Failed to load messages: ${error.message}`);
  return (data ?? []) as AnnouncementRow[];
}

/** Live messages that could be for this customer (audience is narrowed by the service). */
export async function listLiveAnnouncementsFor(userId: string, since: string): Promise<AnnouncementRow[]> {
  const now = new Date().toISOString();
  const { data, error } = await createAdminClient()
    .from("announcements")
    .select(COLUMNS)
    .eq("status", "sent")
    .gte("created_at", since)
    .or(`target_user_id.is.null,target_user_id.eq.${userId}`)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(`Failed to load messages: ${error.message}`);
  return (data ?? []) as AnnouncementRow[];
}

export async function listReceiptsFor(userId: string, ids: string[]): Promise<Map<string, { seen_at: string; dismissed_at: string | null }>> {
  const out = new Map<string, { seen_at: string; dismissed_at: string | null }>();
  if (ids.length === 0) return out;
  const { data, error } = await createAdminClient().from("announcement_receipts").select("announcement_id, seen_at, dismissed_at").eq("user_id", userId).in("announcement_id", ids);
  if (error) throw new Error(`Failed to load message receipts: ${error.message}`);
  for (const r of (data ?? []) as { announcement_id: string; seen_at: string; dismissed_at: string | null }[]) out.set(r.announcement_id, { seen_at: r.seen_at, dismissed_at: r.dismissed_at });
  return out;
}

export async function upsertReceipt(input: { announcementId: string; userId: string; dismissed: boolean }): Promise<void> {
  const now = new Date().toISOString();
  const row = { announcement_id: input.announcementId, user_id: input.userId, ...(input.dismissed ? { dismissed_at: now } : {}) };
  const { error } = await createAdminClient().from("announcement_receipts").upsert(row, { onConflict: "announcement_id,user_id", ignoreDuplicates: !input.dismissed });
  if (error) throw new Error(`Failed to record the message receipt: ${error.message}`);
}

/** Seen and dismissed counts per message, for the admin list. */
export async function countReceipts(ids: string[]): Promise<Map<string, { seen: number; dismissed: number }>> {
  const out = new Map<string, { seen: number; dismissed: number }>();
  if (ids.length === 0) return out;
  const { data, error } = await createAdminClient().from("announcement_receipts").select("announcement_id, dismissed_at").in("announcement_id", ids).limit(10000);
  if (error) throw new Error(`Failed to count message receipts: ${error.message}`);
  for (const r of (data ?? []) as { announcement_id: string; dismissed_at: string | null }[]) {
    const c = out.get(r.announcement_id) ?? { seen: 0, dismissed: 0 };
    c.seen += 1;
    if (r.dismissed_at) c.dismissed += 1;
    out.set(r.announcement_id, c);
  }
  return out;
}

/** Does this customer have a paid order (the "ordered" audience)? */
export async function hasPaidOrder(userId: string): Promise<boolean> {
  const { count, error } = await createAdminClient()
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["paid", "processing", "in_transit", "delivered", "completed"]);
  if (error) throw new Error(`Failed to check orders: ${error.message}`);
  return (count ?? 0) > 0;
}

/** How many customers an audience reaches today. */
export async function audienceSize(audience: AnnouncementAudience): Promise<number> {
  const db = createAdminClient();
  if (audience === "one") return 1;
  if (audience === "all") {
    const { count, error } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("role", "user");
    if (error) throw new Error(`Failed to count customers: ${error.message}`);
    return count ?? 0;
  }
  const { data, error } = await db.from("orders").select("user_id").in("status", ["paid", "processing", "in_transit", "delivered", "completed"]).limit(20000);
  if (error) throw new Error(`Failed to count customers: ${error.message}`);
  return new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id)).size;
}

/** A customer's id from their sign-in email (one auth page at a time; the user base is small). */
export async function findUserIdByEmail(email: string): Promise<string | null> {
  const db = createAdminClient();
  const wanted = email.trim().toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Failed to look up the customer: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === wanted);
    if (hit) return hit.id;
    if (data.users.length < 1000) return null;
  }
  return null;
}
