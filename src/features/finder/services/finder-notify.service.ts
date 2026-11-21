import "server-only";

import {
  claimFinderTurnEmail,
  clearFinderTurnEmailed,
  getFinderChatById,
  listTurnsForRun,
  type FinderChatMessageRow,
} from "@/db/queries/finder-chats";
import { clearFinderRunEmailed, listFinderRunsByIds, markFinderRunEmailed, type FinderRunRow } from "@/db/queries/finder-runs";
import { getRecipientEmail } from "@/db/queries/notifications";
import { queueWhatsApp } from "@/features/notifications/services/whatsapp.service";
import { env } from "@/lib/env";
import { mayEmailUser } from "@/lib/email/notify-preference";
import { sendEmail } from "@/lib/email/transport";
import { logger } from "@/lib/logger";
import { whatsappMessages } from "@/lib/whatsapp/templates";

import { finderNoMatchTemplate, finderResultTemplate, finderTurnTemplate, type FinderTurnItem } from "../email/finder-result-email";
import { buyerWhatsappHref } from "../format";
import { reduceFinderEvents, selectRankedCandidates } from "../state/reducer";

/**
 * "We'll email you the best price": the promise the run screen makes, kept.
 *
 * Sent once per run (`emailed_at` is stamped before the send and cleared if it
 * fails), from the run's own events through the same reducer the screen uses,
 * so the email and the page cannot disagree. Never throws.
 */

export function finderRunPath(runId: string): string {
  return `/app/find/${runId}`;
}

export function finderChatPath(chatId: string): string {
  return `/app/find/chat/${chatId}`;
}

/** Where this run's result goes: the visitor's typed address, else the account's own when it takes email. */
export async function finderRecipient(run: Pick<FinderRunRow, "email" | "user_id">): Promise<string | null> {
  if (run.email) return run.email;
  if (!run.user_id) return null;
  if (!(await mayEmailUser(run.user_id))) return null;
  return getRecipientEmail(run.user_id);
}

export async function notifyFinderFinished(run: FinderRunRow, buyerNumber: string | null): Promise<"sent" | "no_address" | "already" | "error" | "not_finished"> {
  if (run.status !== "done" && run.status !== "no_match" && run.status !== "failed") return "not_finished";
  try {
    const to = await finderRecipient(run);
    const runUrl = `${env.app.url}${finderRunPath(run.id)}`;
    const state = reduceFinderEvents(run.events);

    // WhatsApp is the customer's opt-in on this run AND on their profile;
    // `queueWhatsApp` checks the profile and de-duplicates on the key.
    if (run.notify_whatsapp && run.user_id && state.phase === "result") {
      const ranked = selectRankedCandidates(state);
      await queueWhatsApp({
        userId: run.user_id,
        event: "finder_result",
        dedupeKey: `finder_result:${run.id}`,
        message: whatsappMessages.quoteReady({ productName: ranked[0]?.title ?? run.query, reviewPath: finderRunPath(run.id) }),
      });
    }

    // A run a chat turn started is part of that turn's one email, sent when its last run settles.
    const turns = await listTurnsForRun(run.id);
    if (turns.length > 0) {
      const results = await Promise.all(turns.map((t) => notifyFinderTurn(t, buyerNumber)));
      return results.includes("sent") ? "sent" : results[0]!;
    }

    if (!to) return "no_address";
    if (!(await markFinderRunEmailed(run.id))) return "already";

    let mail: { subject: string; html: string };
    if (state.phase === "result") {
      const ranked = selectRankedCandidates(state);
      const [best, ...alternatives] = ranked;
      if (!best) return "error";
      // The item as understood, not the sentence typed: "Best price for iPhone 17 Pro", never "for Can you get me…".
      mail = finderResultTemplate({ query: state.spec?.product ?? run.query, best, alternatives, runUrl });
    } else {
      const message = state.nothingFound?.message ?? "We could not find this one.";
      const text = state.nothingFound?.whatsappText ?? run.query;
      mail = finderNoMatchTemplate({ query: state.spec?.product ?? run.query, message, runUrl, buyerHref: buyerNumber ? buyerWhatsappHref(buyerNumber, text) : null });
    }

    try {
      await sendEmail({ to, subject: mail.subject, html: mail.html });
      return "sent";
    } catch (error) {
      await clearFinderRunEmailed(run.id);
      logger.error("finder: result email failed", { runId: run.id, error: error instanceof Error ? error.message : String(error) });
      return "error";
    }
  } catch (error) {
    logger.error("finder: notify failed", { runId: run.id, error: error instanceof Error ? error.message : String(error) });
    return "error";
  }
}

/**
 * One chat turn's email (107): every item the customer named in one message,
 * once every run the turn started has settled. The claim is atomic, so the
 * last two runs finishing together send it once. Never throws.
 */
export async function notifyFinderTurn(
  turn: Pick<FinderChatMessageRow, "id" | "chat_id" | "run_ids">,
  buyerNumber: string | null,
): Promise<"sent" | "no_address" | "already" | "error"> {
  try {
    const chat = await getFinderChatById(turn.chat_id);
    if (!chat) return "error";
    const to = await finderRecipient({ email: chat.email, user_id: chat.user_id });
    if (!to) return "no_address";
    if (!(await claimFinderTurnEmail(turn.id))) return "already";

    const byId = new Map((await listFinderRunsByIds(turn.run_ids)).map((r) => [r.id, r]));
    const items: FinderTurnItem[] = turn.run_ids.flatMap((id) => {
      const run = byId.get(id);
      if (!run) return [];
      const state = reduceFinderEvents(run.events);
      const ranked = state.phase === "result" ? selectRankedCandidates(state) : [];
      return [
        {
          product: state.spec?.product ?? run.query,
          best: ranked[0] ?? null,
          alternatives: ranked.slice(1),
          nothingMessage: state.nothingFound?.message ?? (ranked.length ? null : "We could not find this one."),
        },
      ];
    });
    if (items.length === 0) return "error";
    const missing = items.filter((i) => !i.best?.quote).map((i) => i.product);
    const buyerHref = buyerNumber && missing.length ? buyerWhatsappHref(buyerNumber, `Hi Tomame, can a buyer find this for me? ${missing.join("; ")}`) : null;
    const mail = finderTurnTemplate({ items, chatUrl: `${env.app.url}${finderChatPath(chat.id)}`, buyerHref });
    try {
      await sendEmail({ to, subject: mail.subject, html: mail.html });
      return "sent";
    } catch (error) {
      await clearFinderTurnEmailed(turn.id);
      logger.error("finder: turn email failed", { messageId: turn.id, error: error instanceof Error ? error.message : String(error) });
      return "error";
    }
  } catch (error) {
    logger.error("finder: turn notify failed", { messageId: turn.id, error: error instanceof Error ? error.message : String(error) });
    return "error";
  }
}
