import "server-only";

import { FINDER } from "@/config/finder";
import {
  getFinderChatForViewer,
  insertFinderChat,
  insertFinderChatMessage,
  listFinderChatMessages,
  listFinderChatsForViewer,
  listLatestMessages,
  touchFinderChat,
  type FinderChatMessageRow,
  type FinderChatRow,
} from "@/db/queries/finder-chats";
import { getQuoteFacts } from "@/db/queries/extraction-cache";
import { listPastesForViewer } from "@/db/queries/extraction-requests";
import { toPasteStatus } from "@/features/extraction/services/paste-status";
import { findRecentFinderRun, insertFinderRun, listFinderRunsByIds, type FinderRunRow } from "@/db/queries/finder-runs";
import type { RequestViewer } from "@/db/queries/extraction-requests";
import { getSiteSettingsMap } from "@/db/queries/site-settings";
import { APIError } from "@/lib/auth/api-helpers";
import { logger } from "@/lib/logger";

import { chatTitle, recentHistory, summariseChatRuns } from "../chat";
import { normaliseFinderQuery, type ParsedFinderSpec } from "../spec";
import { reduceFinderEvents, selectRankedCandidates } from "../state/reducer";
import type { FinderChatMessageView, FinderChatSummary, FinderChatView, PastedLinkSummary } from "../types";
import { planChatTurn } from "./finder-chat-ai.service";
import { finderRecipient, notifyFinderTurn } from "./finder-notify.service";
import { toFinderRunView } from "./finder-run.service";

/**
 * The shopping assistant (107): a conversation in which each customer message
 * may start one finder run per item. The model chooses the words and the
 * items; the runs do every search and every price exactly as a one-line
 * request does. Nothing here touches money.
 */

export interface SendChatInput {
  chatId: string | null;
  text: string;
  /** A visitor's address for results; ignored for an account. */
  email: string | null;
}

export interface SendChatResult {
  chat: FinderChatRow;
  messages: FinderChatMessageView[];
  /** Fresh runs for the route to start behind the response. */
  newRunIds: string[];
  /** The turn the route checks for its email once those runs settle. */
  turn: FinderChatMessageRow;
}

const toMessageView = (m: FinderChatMessageRow): FinderChatMessageView => ({
  id: m.id,
  role: m.role,
  content: m.content,
  runIds: m.run_ids,
  createdAt: m.created_at,
});

/** "iPhone 17 Pro, unlocked": the run's query line, so its page and email name the item, not the sentence. */
export function searchLabel(spec: Pick<ParsedFinderSpec, "product" | "mustHaves">): string {
  const extra = spec.mustHaves.filter((m) => !spec.product.toLowerCase().includes(m.toLowerCase()));
  return [spec.product, ...extra].join(", ").slice(0, 200);
}

/**
 * Start (or reuse) one run per item. The same item from the same viewer
 * inside the cache window is the earlier run and costs nothing; a fresh one
 * must pass `admit`. Returns the run ids in item order and whether the limit
 * stopped any.
 */
async function startItemRuns(
  viewer: RequestViewer,
  specs: readonly ParsedFinderSpec[],
  admit: () => Promise<boolean>,
): Promise<{ runIds: string[]; fresh: string[]; limited: number }> {
  const since = new Date(Date.now() - FINDER.cacheHours * 3600_000).toISOString();
  const runIds: string[] = [];
  const fresh: string[] = [];
  let limited = 0;
  for (const spec of specs) {
    const query = searchLabel(spec);
    const queryKey = normaliseFinderQuery(query, spec.budgetGhs);
    const recent = await findRecentFinderRun(viewer, queryKey, since);
    if (recent) {
      runIds.push(recent.id);
      continue;
    }
    if (!(await admit())) {
      limited += 1;
      continue;
    }
    const run = await insertFinderRun({
      viewer,
      query,
      queryKey,
      budgetGhs: spec.budgetGhs,
      email: null,
      notifyWhatsapp: false,
      events: [{ type: "run_started", at: 0, query, budgetGhs: spec.budgetGhs }],
      spec: { ...spec },
    });
    runIds.push(run.id);
    fresh.push(run.id);
  }
  return { runIds, fresh, limited };
}

/**
 * One customer message: saved, answered, and its items searched. A chat id
 * that is not the viewer's is a 404. When the model cannot be reached the
 * message is searched as one item, as the one-line finder does.
 */
export async function sendChatMessage(
  viewer: RequestViewer,
  input: SendChatInput,
  admitSearch: () => Promise<boolean>,
  limitMessage: string,
): Promise<SendChatResult> {
  if (!viewer.userId && !viewer.sessionId) throw new APIError(400, "We could not tell whose chat this is. Reload and try again.");
  const text = input.text.replace(/\s+/g, " ").trim();

  let chat: FinderChatRow;
  if (input.chatId) {
    const found = await getFinderChatForViewer(input.chatId, viewer);
    if (!found) throw new APIError(404, "We have no record of that chat.");
    chat = found;
  } else {
    chat = await insertFinderChat(viewer, chatTitle(text), viewer.userId ? null : input.email);
  }
  if (!viewer.userId && input.email && input.email !== chat.email) {
    await touchFinderChat(chat.id, { email: input.email });
    chat = { ...chat, email: input.email };
  }

  const userMessage = await insertFinderChatMessage({ chatId: chat.id, role: "user", content: text });
  const earlier = await listFinderChatMessages(chat.id);
  const history = recentHistory(earlier.map((m) => ({ role: m.role, content: m.content })));
  const runIds = [...new Set(earlier.flatMap((m) => m.run_ids))];
  const runs = await listFinderRunsByIds(runIds);
  const byId = new Map(runs.map((r) => [r.id, r]));
  const summary = summariseChatRuns(runIds.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : [])));

  const usage = { input: 0, output: 0 };
  const turn = await planChatTurn(history, summary, usage);
  // No model: search the message as one item; the run reads it itself.
  const plan = turn ?? { reply: "Searching for that now.", searches: null as ParsedFinderSpec[] | null };

  let started: { runIds: string[]; fresh: string[]; limited: number };
  if (plan.searches) {
    started = await startItemRuns(viewer, plan.searches, admitSearch);
  } else {
    started = await startUnreadRun(viewer, text, admitSearch);
  }

  let reply = plan.reply;
  if (started.limited > 0) reply = `${reply} ${limitMessage}`.trim();
  const assistant = await insertFinderChatMessage({ chatId: chat.id, role: "assistant", content: reply.slice(0, 4000), runIds: started.runIds });
  await touchFinderChat(chat.id);
  logger.info("finder chat: turn", { chatId: chat.id, searches: started.runIds.length, fresh: started.fresh.length, limited: started.limited, tokens: usage });

  return { chat, messages: [toMessageView(userMessage), toMessageView(assistant)], newRunIds: started.fresh, turn: assistant };
}

/** The fallback when the assistant is unavailable: the message as one search the run reads itself. */
async function startUnreadRun(viewer: RequestViewer, text: string, admit: () => Promise<boolean>) {
  const query = text.slice(0, FINDER.maxQueryLength);
  const queryKey = normaliseFinderQuery(query, null);
  const since = new Date(Date.now() - FINDER.cacheHours * 3600_000).toISOString();
  const recent = await findRecentFinderRun(viewer, queryKey, since);
  if (recent) return { runIds: [recent.id], fresh: [], limited: 0 };
  if (!(await admit())) return { runIds: [], fresh: [], limited: 1 };
  const run = await insertFinderRun({ viewer, query, queryKey, budgetGhs: null, email: null, notifyWhatsapp: false, events: [{ type: "run_started", at: 0, query, budgetGhs: null }] });
  return { runIds: [run.id], fresh: [run.id], limited: 0 };
}

/** After the turn's runs settle (or at once when every item was an earlier run): its one email. */
export async function emailTurnWhenSettled(turn: FinderChatMessageRow): Promise<void> {
  if (turn.run_ids.length === 0) return;
  await notifyFinderTurn(turn, await buyerWhatsappNumber());
}

async function buyerWhatsappNumber(): Promise<string | null> {
  try {
    const raw = (await getSiteSettingsMap()).whatsapp_number;
    return typeof raw === "string" && raw.trim() ? raw : null;
  } catch {
    return null;
  }
}

/** The chat as its screen reads it: every message and every run it started. `lite` is the poll. */
export async function getChatView(chatId: string, viewer: RequestViewer, options: { lite?: boolean } = {}): Promise<FinderChatView | null> {
  const chat = await getFinderChatForViewer(chatId, viewer);
  if (!chat) return null;
  const messages = await listFinderChatMessages(chat.id);
  const runIds = [...new Set(messages.flatMap((m) => m.run_ids))];
  const runs = await listFinderRunsByIds(runIds);
  const views = await Promise.all(runs.map((r) => toFinderRunView(r, { lite: true })));
  const [email, buyer] = options.lite
    ? [chat.email, null]
    : await Promise.all([finderRecipient({ email: chat.email, user_id: chat.user_id }).catch(() => chat.email), buyerWhatsappNumber()]);
  return {
    id: chat.id,
    title: chat.title,
    email,
    emailEditable: !chat.user_id,
    messages: messages.map(toMessageView),
    runs: Object.fromEntries(views.map((v) => [v.id, v])),
    buyerWhatsappNumber: buyer,
  };
}

/** A visitor's address for this chat's results; any finished turn not yet emailed goes now. */
export async function updateChatEmail(chatId: string, viewer: RequestViewer, email: string): Promise<FinderChatMessageRow[]> {
  const chat = await getFinderChatForViewer(chatId, viewer);
  if (!chat) throw new APIError(404, "We have no record of that chat.");
  if (chat.user_id) throw new APIError(400, "Results go to your account's email address.");
  await touchFinderChat(chat.id, { email });
  return (await listFinderChatMessages(chat.id)).filter((m) => m.role === "assistant" && m.run_ids.length > 0 && !m.emailed_at);
}

function itemsOf(run: FinderRunRow): FinderChatSummary["items"][number] {
  const state = reduceFinderEvents(run.events);
  const best = state.phase === "result" ? selectRankedCandidates(state)[0] : undefined;
  return {
    product: state.spec?.product ?? run.query,
    status: run.status,
    totalGhs: best?.quote?.totalGhs ?? null,
    imageUrl: best?.imageUrl ?? null,
  };
}

/** The viewer's history: newest chats first, each with what its searches found. Never throws. */
export async function listChatHistory(viewer: RequestViewer, limit = 8): Promise<FinderChatSummary[]> {
  try {
    const chats = await listFinderChatsForViewer(viewer, limit);
    if (chats.length === 0) return [];
    const latest = await listLatestMessages(chats.map((c) => c.id));
    const runIdsByChat = new Map(chats.map((c) => [c.id, [...new Set((latest.get(c.id) ?? []).flatMap((m) => m.run_ids))].slice(0, 4)]));
    const runs = await listFinderRunsByIds([...runIdsByChat.values()].flat());
    const byId = new Map(runs.map((r) => [r.id, r]));
    return chats.map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updated_at,
      items: (runIdsByChat.get(c.id) ?? []).flatMap((id) => (byId.get(id) ? [itemsOf(byId.get(id)!)] : [])),
    }));
  } catch (error) {
    logger.warn("finder chat: history read failed", { error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
};

/**
 * The viewer's pasted links, newest first, for the Chats tab's history: one
 * place for everything they asked us for. The paste queue decides each link's
 * state; nothing is priced here. Never throws.
 */
export async function listPastedLinks(viewer: RequestViewer, limit = 8): Promise<PastedLinkSummary[]> {
  try {
    const pastes = (await listPastesForViewer(viewer)).slice(0, limit);
    const facts = await getQuoteFacts(pastes.map((p) => p.extraction_cache_id ?? ""));
    return pastes.map((p) => {
      const status = toPasteStatus(p, facts.get(p.extraction_cache_id ?? ""));
      return {
        id: status.id,
        title: status.title ?? hostOf(status.product_url),
        storeHost: hostOf(status.product_url),
        outcome: status.outcome,
        href: status.outcome === "priced" && status.extraction_cache_id ? `/app/orders/review/${status.extraction_cache_id}` : `/app/orders/new?watch=${status.id}`,
        pastedAt: status.updated_at,
      };
    });
  } catch (error) {
    logger.warn("finder chat: pasted links read failed", { error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}
