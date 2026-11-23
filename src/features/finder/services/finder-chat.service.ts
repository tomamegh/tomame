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
  getProfilePhone,
  setProfilePhone,
} from "@/db/queries/finder-chats";
import { listOpenAssistedRequestsByUrl } from "@/db/queries/assisted-requests";
import { getQuoteFacts } from "@/db/queries/extraction-cache";
import { listPastesByIdsForViewer, listPastesForViewer } from "@/db/queries/extraction-requests";
import { linksInText } from "@/features/extraction/components/batch-format";
import { enqueuePaste, PasteNotAdmittedError, settleStuckPastes } from "@/features/extraction/services/extraction-queue.service";
import { PASTE_BATCH_MAX } from "@/features/extraction/services/paste-batch";
import { toPasteStatus, type PasteStatus } from "@/features/extraction/services/paste-status";
import { findRecentFinderRun, insertFinderRun, listFinderRunsByIds, type FinderRunRow } from "@/db/queries/finder-runs";
import type { RequestViewer } from "@/db/queries/extraction-requests";
import { getSiteSettingsMap } from "@/db/queries/site-settings";
import { APIError } from "@/lib/auth/api-helpers";
import { logger } from "@/lib/logger";

import { priceContextFacts } from "@/features/extraction/price-context";
import { VISITOR_SIGN_IN_MESSAGE } from "../admission";
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

/** Who may queue a link (the paste queue's own buckets: a cache hit is cheaper than a read). */
export type PasteAdmit = (cacheHit: boolean) => Promise<boolean>;

export interface SendChatResult {
  chat: FinderChatRow;
  messages: FinderChatMessageView[];
  /** Fresh runs for the route to start behind the response. */
  newRunIds: string[];
  /** Pasted links that need reading, for the route to start behind the response. */
  newPasteJobs: string[];
  /** Pasted links the cache already priced: a lone one can open its quote at once. */
  readyQuotes: { pasteId: string; extractionCacheId: string }[];
  /** The turn the route checks for its email once those runs settle. */
  turn: FinderChatMessageRow;
  /** The model's tokens this turn; null when the model was not called (links only). */
  usage: { input: number; output: number } | null;
  /** A visitor's free taste ran out this turn: the screen offers sign-in. */
  signInRequired: boolean;
}

/** Why a search or link was turned away: the words to say, and whether it is the visitor sign-in wall. */
export type ChatRefusal = () => { message: string; signIn: boolean };

const toMessageView = (m: FinderChatMessageRow): FinderChatMessageView => ({
  id: m.id,
  role: m.role,
  content: m.content,
  runIds: m.run_ids,
  pasteIds: m.paste_ids ?? [],
  createdAt: m.created_at,
  // The sign-in wall's words mark the turn: the screen draws the sign-in card under it.
  signIn: m.role === "assistant" && m.content.includes(VISITOR_SIGN_IN_MESSAGE),
});

/** The words of a message with its links taken out: what is left for the assistant to read. */
export function wordsBesideLinks(text: string, links: readonly string[]): string {
  let rest = text;
  for (const l of links) rest = rest.split(l).join(" ");
  return rest.replace(/\s+/g, " ").trim();
}

/** A first message that is only links is titled by where they are from, not by the URL. */
export function linksTitle(links: readonly string[]): string {
  const host = (() => {
    try {
      return new URL(/^https?:\/\//i.test(links[0]!) ? links[0]! : `https://${links[0]}`).hostname.replace(/^www\./i, "");
    } catch {
      return "a store";
    }
  })();
  return links.length === 1 ? `Link from ${host}` : `${links.length} links`;
}

/** The assistant's line for links it is reading. No model: the cards under it say the rest. */
export function linksReply(queued: number, limited: number, failed: number): string {
  const parts: string[] = [];
  if (queued === 1) parts.push("Reading that link now. Its full price, landed in Accra, shows here as soon as it's ready.");
  else if (queued > 1) parts.push(`Reading your ${queued} links now. Each price lands here, and you can add them to your bag together.`);
  if (limited > 0) parts.push("You've added a lot of links in a short time, so I've left some out. Try those again in a few minutes.");
  if (failed > 0) parts.push(failed === 1 && queued === 0 ? "I couldn't read that as a product link. Copy the link from your browser's address bar and paste it again." : `${failed === 1 ? "One link" : `${failed} links`} didn't look like product pages. Copy each from your browser's address bar.`);
  return parts.join(" ");
}

/** Queue each link on the paste queue (049), as the old paste box did. Never throws. */
async function queueLinks(viewer: RequestViewer, links: readonly string[], admit: PasteAdmit) {
  const pasteIds: string[] = [];
  const jobs: string[] = [];
  const ready: { pasteId: string; extractionCacheId: string }[] = [];
  let limited = 0;
  let failed = 0;
  for (const link of links) {
    try {
      const queued = await enqueuePaste(viewer, link, admit);
      if (!queued) {
        failed += 1;
        continue;
      }
      if (!pasteIds.includes(queued.request.id)) pasteIds.push(queued.request.id);
      if (!queued.ready) jobs.push(queued.request.id);
      else if (queued.request.extraction_cache_id) ready.push({ pasteId: queued.request.id, extractionCacheId: queued.request.extraction_cache_id });
    } catch (error) {
      if (error instanceof PasteNotAdmittedError) limited += 1;
      else {
        failed += 1;
        logger.warn("finder chat: link not queued", { error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return { pasteIds, jobs, ready, limited, failed };
}

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
  limitMessage: string | ChatRefusal,
  admitPaste: PasteAdmit = async () => true,
): Promise<SendChatResult> {
  const refusal: ChatRefusal = typeof limitMessage === "string" ? () => ({ message: limitMessage, signIn: false }) : limitMessage;
  if (!viewer.userId && !viewer.sessionId) throw new APIError(400, "We could not tell whose chat this is. Reload and try again.");
  const text = input.text.replace(/\s+/g, " ").trim();
  const links = linksInText(text).slice(0, PASTE_BATCH_MAX);
  const words = links.length ? wordsBesideLinks(text, links) : text;

  let chat: FinderChatRow;
  if (input.chatId) {
    const found = await getFinderChatForViewer(input.chatId, viewer);
    if (!found) throw new APIError(404, "We have no record of that chat.");
    chat = found;
  } else {
    chat = await insertFinderChat(viewer, links.length && words.length < 3 ? linksTitle(links) : chatTitle(words || text), viewer.userId ? null : input.email);
  }
  if (!viewer.userId && input.email && input.email !== chat.email) {
    await touchFinderChat(chat.id, { email: input.email });
    chat = { ...chat, email: input.email };
  }

  const userMessage = await insertFinderChatMessage({ chatId: chat.id, role: "user", content: text });
  const pasted = links.length ? await queueLinks(viewer, links, admitPaste) : { pasteIds: [], jobs: [], ready: [], limited: 0, failed: 0 };

  // Links alone need no model: they are read and priced as pasted links always were.
  // Words beside them (or no links at all) are the assistant's to answer.
  const linksWalled = pasted.limited > 0 && refusal().signIn;
  let reply = links.length ? linksReply(pasted.pasteIds.length, linksWalled ? 0 : pasted.limited, pasted.failed) : "";
  let started: { runIds: string[]; fresh: string[]; limited: number } = { runIds: [], fresh: [], limited: 0 };
  const usage = { input: 0, output: 0 };
  let modelCalled = false;
  if (!links.length || words.length >= 3) {
    modelCalled = true;
    const earlier = await listFinderChatMessages(chat.id);
    const history = recentHistory(earlier.map((m) => ({ role: m.role, content: m.id === userMessage.id && links.length ? `${words} (and ${links.length === 1 ? "a link, which you are reading" : `${links.length} links, which you are reading`})` : m.content })));
    const runIds = [...new Set(earlier.flatMap((m) => m.run_ids))];
    const runs = await listFinderRunsByIds(runIds);
    const byId = new Map(runs.map((r) => [r.id, r]));
    const pasteIds = [...new Set(earlier.flatMap((m) => m.paste_ids ?? []))];
    const pastes = await readChatPastes(pasteIds, viewer).catch(() => [] as PasteStatus[]);
    const summary = [summariseChatRuns(runIds.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : []))), summarisePastes(pastes)].filter(Boolean).join("\n") || null;

    const turn = await planChatTurn(history, summary, usage);
    // No model: search the message as one item; the run reads it itself.
    const plan = turn ?? { reply: "Searching for that now.", searches: null as ParsedFinderSpec[] | null };
    started = plan.searches ? await startItemRuns(viewer, plan.searches, admitSearch) : await startUnreadRun(viewer, words || text, admitSearch);
    reply = [reply, plan.reply].filter(Boolean).join(" ");
  }

  const refused = refusal();
  const signInRequired = refused.signIn && (linksWalled || started.limited > 0);
  if (started.limited > 0 || linksWalled) reply = `${reply.replace(refused.message, "").trim()} ${refused.message}`.trim();
  const assistant = await insertFinderChatMessage({
    chatId: chat.id,
    role: "assistant",
    content: (reply || "Done.").slice(0, 4000),
    runIds: started.runIds,
    pasteIds: pasted.pasteIds,
  });
  await touchFinderChat(chat.id);
  logger.info("finder chat: turn", { chatId: chat.id, searches: started.runIds.length, fresh: started.fresh.length, limited: started.limited, links: pasted.pasteIds.length, tokens: usage });

  return {
    chat,
    messages: [toMessageView(userMessage), toMessageView(assistant)],
    newRunIds: started.fresh,
    newPasteJobs: pasted.jobs,
    readyQuotes: pasted.ready,
    turn: assistant,
    usage: modelCalled ? usage : null,
    signInRequired,
  };
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

/** A chat's pasted links as the paste queue reports them, in the order asked. Owner-scoped. */
async function readChatPastes(ids: readonly string[], viewer: RequestViewer): Promise<PasteStatus[]> {
  if (ids.length === 0) return [];
  const rows = await listPastesByIdsForViewer(ids, viewer);
  const [facts, assisted] = await Promise.all([
    getQuoteFacts(rows.map((r) => r.extraction_cache_id ?? "")),
    listOpenAssistedRequestsByUrl(viewer, rows.map((r) => r.product_url)),
  ]);
  const byId = new Map(rows.map((r) => [r.id, toPasteStatus(r, facts.get(r.extraction_cache_id ?? ""), assisted.get(r.product_url) ?? null)]));
  return ids.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : []));
}

/** The pasted links for the model: what each is and where it stands. Prices are on the cards, not here. */
export function summarisePastes(pastes: readonly PasteStatus[]): string | null {
  if (pastes.length === 0) return null;
  const state: Record<PasteStatus["outcome"], string> = {
    reading: "still being read",
    priced: "priced; the landed total is on its card",
    unpriced: "page read but no price found; the customer can describe it for a buyer",
    unavailable: "out of stock at the store",
    expired: "the free quote passed its 24 hours unpaid and was cancelled; a fresh quote is one tap on its card",
    stale: "priced, but the price needs a fresh check before paying; the card has a re-check button",
    manual: "we could not price it automatically; a buyer is quoting it by hand and the reply comes to this chat",
  };
  return pastes
    .map((p) => {
      const facts = p.outcome === "priced" ? priceContextFacts(p.price_context ?? null) : null;
      return `- Pasted link: ${p.title ?? p.product_url}: ${state[p.outcome]}${facts ? `; ${facts}` : ""}.`;
    })
    .join("\n");
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
  const pasteIds = [...new Set(messages.flatMap((m) => m.paste_ids ?? []))];
  const [runs, pastesFirst] = await Promise.all([listFinderRunsByIds(runIds), readChatPastes(pasteIds, viewer)]);
  // Nothing on a chat reads forever: a stuck link is settled when the chat is looked at (as GET /api/pastes does).
  let pastes = pastesFirst;
  if (pastes.some((p) => p.outcome === "reading")) {
    await settleStuckPastes(viewer);
    pastes = await readChatPastes(pasteIds, viewer);
  }
  const views = await Promise.all(runs.map((r) => toFinderRunView(r, { lite: true })));
  const [email, buyer, phone] = options.lite
    ? [chat.email, null, chat.user_id ? await getProfilePhone(chat.user_id).catch(() => null) : chat.phone]
    : await Promise.all([
        finderRecipient({ email: chat.email, user_id: chat.user_id }).catch(() => chat.email),
        buyerWhatsappNumber(),
        chat.user_id ? getProfilePhone(chat.user_id).catch(() => null) : Promise.resolve(chat.phone),
      ]);
  return {
    id: chat.id,
    title: chat.title,
    email,
    emailEditable: !chat.user_id,
    phone,
    messages: messages.map(toMessageView),
    runs: Object.fromEntries(views.map((v) => [v.id, v])),
    pastes: Object.fromEntries(pastes.map((p) => [p.id, p])),
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

/**
 * The customer's WhatsApp number (109): how Tomame reaches customers. A
 * visitor's goes on the chat; an account's on the profile, with WhatsApp
 * updates turned on. Finished turns not yet sent go now.
 */
export async function updateChatPhone(chatId: string, viewer: RequestViewer, phone: string): Promise<FinderChatMessageRow[]> {
  const chat = await getFinderChatForViewer(chatId, viewer);
  if (!chat) throw new APIError(404, "We have no record of that chat.");
  if (chat.user_id) await setProfilePhone(chat.user_id, phone);
  else await touchFinderChat(chat.id, { phone });
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
