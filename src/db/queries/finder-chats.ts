import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import type { RequestViewer } from "./extraction-requests";

/**
 * `finder_chats` and `finder_chat_messages` (migration 107). Service role
 * throughout with an explicit owner filter on every viewer read, as
 * finder-runs.ts: the filter IS the authorization. Never drop it.
 */

export interface FinderChatRow {
  id: string;
  user_id: string | null;
  session_id: string | null;
  title: string;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinderChatMessageRow {
  id: string;
  chat_id: string;
  role: "user" | "assistant";
  content: string;
  run_ids: string[];
  /** 108: links this turn queued on the paste queue, in the order pasted. */
  paste_ids: string[];
  emailed_at: string | null;
  created_at: string;
}

const CHAT_COLUMNS = "id, user_id, session_id, title, email, created_at, updated_at";
const MESSAGE_COLUMNS = "id, chat_id, role, content, run_ids, paste_ids, emailed_at, created_at";
const nowIso = () => new Date().toISOString();

function ownerFilter(viewer: RequestViewer): { column: "user_id" | "session_id"; value: string } | null {
  if (viewer.userId) return { column: "user_id", value: viewer.userId };
  if (viewer.sessionId) return { column: "session_id", value: viewer.sessionId };
  return null;
}

export async function insertFinderChat(viewer: RequestViewer, title: string, email: string | null): Promise<FinderChatRow> {
  const owner = ownerFilter(viewer);
  if (!owner) throw new Error("A chat needs an owner");
  const { data, error } = await createAdminClient()
    .from("finder_chats")
    .insert({ [owner.column]: owner.value, title, email })
    .select(CHAT_COLUMNS)
    .single();
  if (error) throw new Error(`Failed to create chat: ${error.message}`);
  return data as FinderChatRow;
}

/**
 * The viewer's chat. A signed-in viewer also sees a chat their session cookie
 * started before they signed in, and it moves to them on this read.
 */
export async function getFinderChatForViewer(id: string, viewer: RequestViewer): Promise<FinderChatRow | null> {
  const db = createAdminClient();
  let query = db.from("finder_chats").select(CHAT_COLUMNS).eq("id", id);
  if (viewer.userId && viewer.sessionId) {
    query = query.or(`user_id.eq.${viewer.userId},session_id.eq.${viewer.sessionId}`);
  } else {
    const owner = ownerFilter(viewer);
    if (!owner) return null;
    query = query.eq(owner.column, owner.value);
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Failed to load chat: ${error.message}`);
  const row = (data as FinderChatRow | null) ?? null;
  if (row && !row.user_id && viewer.userId && row.session_id === viewer.sessionId) {
    const { error: adoptError } = await db
      .from("finder_chats")
      .update({ user_id: viewer.userId, session_id: null })
      .eq("id", row.id)
      .eq("session_id", row.session_id);
    if (adoptError) logger.warn("finder chat adoption failed", { id: row.id, message: adoptError.message });
    else return { ...row, user_id: viewer.userId, session_id: null };
  }
  return row;
}

/** The viewer's chats, newest activity first. */
export async function listFinderChatsForViewer(viewer: RequestViewer, limit: number): Promise<FinderChatRow[]> {
  const db = createAdminClient();
  let query = db.from("finder_chats").select(CHAT_COLUMNS);
  if (viewer.userId && viewer.sessionId) query = query.or(`user_id.eq.${viewer.userId},session_id.eq.${viewer.sessionId}`);
  else {
    const owner = ownerFilter(viewer);
    if (!owner) return [];
    query = query.eq(owner.column, owner.value);
  }
  const { data, error } = await query.order("updated_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`Failed to list chats: ${error.message}`);
  return (data ?? []) as FinderChatRow[];
}

export async function touchFinderChat(id: string, patch: { email?: string | null } = {}): Promise<void> {
  const { error } = await createAdminClient()
    .from("finder_chats")
    .update({ updated_at: nowIso(), ...(patch.email !== undefined ? { email: patch.email } : {}) })
    .eq("id", id);
  if (error) logger.warn("finder chat touch failed", { id, message: error.message });
}

export async function insertFinderChatMessage(input: {
  chatId: string;
  role: "user" | "assistant";
  content: string;
  runIds?: string[];
  pasteIds?: string[];
}): Promise<FinderChatMessageRow> {
  const { data, error } = await createAdminClient()
    .from("finder_chat_messages")
    .insert({ chat_id: input.chatId, role: input.role, content: input.content, run_ids: input.runIds ?? [], paste_ids: input.pasteIds ?? [] })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) throw new Error(`Failed to save chat message: ${error.message}`);
  return data as FinderChatMessageRow;
}

/** A chat's messages, oldest first. Call only after the chat itself passed the owner filter. */
export async function listFinderChatMessages(chatId: string, limit = 200): Promise<FinderChatMessageRow[]> {
  const { data, error } = await createAdminClient()
    .from("finder_chat_messages")
    .select(MESSAGE_COLUMNS)
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Failed to load chat messages: ${error.message}`);
  return (data ?? []) as FinderChatMessageRow[];
}

/** The newest message per chat, for the history list's second line. */
export async function listLatestMessages(chatIds: readonly string[]): Promise<Map<string, FinderChatMessageRow[]>> {
  const out = new Map<string, FinderChatMessageRow[]>();
  if (chatIds.length === 0) return out;
  const { data, error } = await createAdminClient()
    .from("finder_chat_messages")
    .select(MESSAGE_COLUMNS)
    .in("chat_id", [...chatIds])
    .order("created_at", { ascending: false })
    .limit(chatIds.length * 6);
  if (error) throw new Error(`Failed to load chat messages: ${error.message}`);
  for (const row of (data ?? []) as FinderChatMessageRow[]) {
    const list = out.get(row.chat_id) ?? [];
    list.push(row);
    out.set(row.chat_id, list);
  }
  return out;
}

/** The turns (unsent) that started this run. Worker-only: no viewer. */
export async function listTurnsForRun(runId: string): Promise<FinderChatMessageRow[]> {
  const { data, error } = await createAdminClient()
    .from("finder_chat_messages")
    .select(MESSAGE_COLUMNS)
    .contains("run_ids", [runId])
    .limit(5);
  if (error) throw new Error(`Failed to find the run's chat turn: ${error.message}`);
  return (data ?? []) as FinderChatMessageRow[];
}

/** Claim a turn's one email (migration 107). True when this caller must send it. */
export async function claimFinderTurnEmail(messageId: string): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("claim_finder_turn_email", { p_message_id: messageId });
  if (error) {
    logger.warn("finder turn email claim failed", { messageId, message: error.message });
    return false;
  }
  return data != null;
}

export async function clearFinderTurnEmailed(messageId: string): Promise<void> {
  await createAdminClient().from("finder_chat_messages").update({ emailed_at: null }).eq("id", messageId);
}

/** One chat by id, unscoped: the worker sending a turn's email. Never expose to a request handler. */
export async function getFinderChatById(id: string): Promise<FinderChatRow | null> {
  const { data, error } = await createAdminClient().from("finder_chats").select(CHAT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Failed to load chat: ${error.message}`);
  return (data as FinderChatRow | null) ?? null;
}
