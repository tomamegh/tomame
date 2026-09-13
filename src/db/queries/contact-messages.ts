import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * `contact_messages` — what `/contact` sends (migration 053).
 *
 * There is no owner-scoped read here on purpose: a contact message usually comes
 * from a signed-out visitor, and the email they typed is the only route back to
 * them. Admins read; every write is the server's.
 */

export type ContactMessageStatus = "open" | "answered" | "closed";

export interface ContactMessageRow {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: ContactMessageStatus;
  handled_by: string | null;
  answered_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS =
  "id, user_id, name, email, subject, message, status, handled_by, answered_at, note, created_at, updated_at";

export async function insertContactMessage(input: {
  userId: string | null;
  name: string;
  email: string;
  subject: string;
  message: string;
}): Promise<ContactMessageRow> {
  const { data, error } = await createAdminClient()
    .from("contact_messages")
    .insert({
      user_id: input.userId,
      name: input.name,
      email: input.email,
      subject: input.subject,
      message: input.message,
    })
    .select(COLUMNS)
    .single();

  // This one DOES throw. The whole point of the change is that the customer is
  // told the truth about whether their message was stored.
  if (error) throw new Error(`Failed to send the message: ${error.message}`);
  return data as ContactMessageRow;
}

/** Oldest open first — someone is waiting on each one. */
export async function listContactMessages(status?: ContactMessageStatus): Promise<ContactMessageRow[]> {
  let query = createAdminClient().from("contact_messages").select(COLUMNS);
  if (status) query = query.eq("status", status);

  const { data, error } = await query.order("created_at", { ascending: true }).limit(200);
  if (error) throw new Error(`Failed to load contact messages: ${error.message}`);
  return (data ?? []) as ContactMessageRow[];
}

/**
 * Move one along, guarded on the status the admin saw so two of them cannot both
 * claim it — the same discipline the assisted queue and the payment transitions use.
 */
export async function transitionContactMessage(input: {
  id: string;
  from: ContactMessageStatus;
  to: ContactMessageStatus;
  handledBy: string;
  note?: string | null;
}): Promise<ContactMessageRow | null> {
  const { data, error } = await createAdminClient()
    .from("contact_messages")
    .update({
      status: input.to,
      handled_by: input.handledBy,
      ...(input.to === "answered" && { answered_at: new Date().toISOString() }),
      ...(input.note !== undefined && { note: input.note }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("status", input.from)
    .select(COLUMNS)
    .maybeSingle();

  if (error) throw new Error(`Failed to update the message: ${error.message}`);
  return (data as ContactMessageRow | null) ?? null;
}

export async function countOpenContactMessages(): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("contact_messages")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");

  if (error) {
    logger.warn("contact message count failed", { message: error.message });
    return 0;
  }
  return count ?? 0;
}
