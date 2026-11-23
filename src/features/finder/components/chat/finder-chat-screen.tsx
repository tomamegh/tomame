"use client";

import { ArrowUp, ChatsCircle, ClockCounterClockwise, NotePencil, Sparkle, WhatsappLogo } from "@phosphor-icons/react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { AssistedRequestDialog } from "@/features/assisted/components";
import { useAddToBag } from "@/features/bag/hooks/useAddToBag";
import { PasteBatchPanel } from "@/features/extraction/components/paste-batch-panel";
import type { PasteStatus } from "@/features/extraction/services/paste-status";
import { riseIn } from "@/lib/motion/presets";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";

import { chatKeys, chatWorking, useChatHistory, useChatPhone, useChatView, useSendChat } from "../../hooks/useChat";
import { recordFinderHandoff } from "../../hooks/useFinder";
import type { FinderCandidateState, FinderChatMessageView, FinderChatSummary, FinderChatView, PastedLinkSummary } from "../../types";
import { WatchedPaste } from "./ask-mode";
import { ChatHistoryList } from "./chat-history-list";
import { ChatRunCard } from "./chat-run-card";
import { useAppRoutes } from "@/lib/native/app-routes";

interface FinderChatScreenProps {
  /** The open chat, server-read; null on a new chat. */
  initial: FinderChatView | null;
  history: FinderChatSummary[];
  /** The viewer's pasted links: the history holds everything they asked us for. */
  pastes: PastedLinkSummary[];
  /** `?q=` from a link: fills the box, never sends by itself. */
  defaultText?: string;
  /** Buy for me's switch (Find it / Browse / Ask a buyer), drawn above the thread. */
  header?: React.ReactNode;
  /** `?watch=`: a pasted link opened from history, with the viewer's pastes to find it in. */
  watch?: { id: string; pastes: PasteStatus[] } | null;
  signedIn: boolean;
  /**
   * "app": the iPhone app (/m). The screen fills the space between the status bar and the
   * tab bar and does not move: only the conversation scrolls, the box is pinned under it,
   * the empty state is one line and a row of suggestions, and the history sits behind its
   * button (Kelvin, 2026-11-23: the box must not be crowded out). The website is unchanged.
   */
  variant?: "web" | "app";
}

const SUGGESTIONS = [
  "The cheapest iPhone 17 Pro, unlocked",
  "A 27-inch monitor for office work under GH₵4,000",
  "PS5 Pro and an extra DualSense controller",
  "Nike running shoes for a 10-year-old, size 4",
];

/**
 * The shopping assistant (107): a conversation, with every chat kept in the
 * history beside it. Each reply can start several searches; their live cards
 * sit under the reply that started them. The assistant never sets a price:
 * every figure is on a card the finder priced.
 */
export function FinderChatScreen({ initial, history, pastes, defaultText = "", header, watch = null, signedIn, variant = "web" }: FinderChatScreenProps) {
  const app = variant === "app";
  const routes = useAppRoutes();
  const router = useRouter();
  const chat = useChatView(initial, initial?.id ?? null);
  const send = useSendChat();
  const historyQuery = useChatHistory(history);
  const addToBag = useAddToBag();
  const savePhone = useChatPhone(chat?.id ?? null);
  const [text, setText] = useState(defaultText);
  const [pending, setPending] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [describing, setDescribing] = useState<PasteStatus | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // The history's "searching" lines turn into prices when the searches settle.
  const queryClient = useQueryClient();
  const anyWorking = chatWorking(chat);
  const wasWorking = useRef(anyWorking);
  useEffect(() => {
    if (wasWorking.current && !anyWorking) void queryClient.invalidateQueries({ queryKey: chatKeys.history });
    wasWorking.current = anyWorking;
  }, [anyWorking, queryClient]);

  const messages: FinderChatMessageView[] = chat?.messages ?? [];
  const lastCount = useRef(messages.length);
  useEffect(() => {
    if (messages.length !== lastCount.current || pending) {
      lastCount.current = messages.length;
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages.length, pending]);

  // Grow the box with what is typed, up to six lines.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  async function submit(raw: string) {
    const value = raw.trim();
    if (!value || send.isPending) return;
    setPending(value);
    setText("");
    try {
      const res = await send.mutateAsync({ chatId: chat?.id ?? null, text: value });
      // A new chat opens its own page; the typed message stays on screen until it does.
      if (!chat) return router.replace(routes.chat(res.chatId));
      await chat.refetch();
      setPending(null);
    } catch (error) {
      setText(value);
      setPending(null);
      toast.error({ title: "Not sent", description: error instanceof Error ? error.message : "Try again." });
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(text);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit(text);
    }
  }

  async function onAddToBag(candidate: FinderCandidateState) {
    if (!candidate.extractionCacheId) {
      toast.error({ title: "Not ready yet", description: "This price is still being confirmed with the store." });
      throw new Error("not ready");
    }
    try {
      await addToBag.mutateAsync({ extraction_cache_id: candidate.extractionCacheId, quantity: 1 });
      toast.success({ title: "In your bag", description: candidate.title });
      router.refresh();
    } catch (error) {
      toast.error({ title: "Could not add that", description: error instanceof Error ? error.message : "Try again." });
      throw error;
    }
  }

  const empty = messages.length === 0 && !pending && !watch;
  const hasRuns = chat != null && Object.keys(chat.runs).length > 0;
  const hasWork = hasRuns || (chat != null && Object.keys(chat.pastes).length > 0);
  const chats = historyQuery.data ?? [];

  return (
    <MotionConfig reducedMotion="user">
      <div
        className={
          app
            ? "flex h-full min-h-0 w-full flex-col"
            : "mx-auto grid w-full max-w-[1180px] grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[272px_minmax(0,1fr)] lg:gap-8"
        }
      >
        <aside className={app ? "hidden" : "hidden lg:block"}>
          <div className="sticky top-6 flex max-h-[calc(100dvh-7rem)] flex-col gap-3">
            <NewChatButton />
            <ChatHistoryList chats={chats} pastes={pastes} activeId={chat?.id ?? null} />
          </div>
        </aside>

        <section className={app ? "flex min-h-0 min-w-0 flex-1 flex-col" : "flex min-h-[calc(100dvh-14rem)] min-w-0 flex-col"}>
          {header && <div className="mb-5">{header}</div>}
          {/* Phones: history behind a button, so the thread keeps the screen. */}
          <div className={cn("mb-4 flex items-center justify-between gap-3 lg:hidden", empty && !app && "hidden", app && "mb-2 shrink-0")}>
            {app && <h1 className="font-display text-[24px] leading-none font-bold tracking-[-0.02em]">Buy for me</h1>}
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              aria-expanded={showHistory}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-tm-border bg-card px-3 text-[13px] font-semibold"
            >
              <ClockCounterClockwise size={16} aria-hidden />
              {app ? "Chats" : "Your chats and links"}
            </button>
            {app ? <span className="-ml-1"><NewChatButton compact /></span> : <NewChatButton compact />}
          </div>
          <AnimatePresence initial={false}>
            {showHistory && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className={cn("mb-4 overflow-hidden lg:hidden", app && "mb-2 max-h-[55%] shrink-0 overflow-y-auto overscroll-contain")}
              >
                <ChatHistoryList chats={chats} pastes={pastes} activeId={chat?.id ?? null} onPick={() => setShowHistory(false)} />
              </motion.div>
            )}
          </AnimatePresence>

          <div className={app ? "-mx-3.5 min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3.5 pb-3" : "contents"}>
          {watch && (
            <div className="mb-6">
              <WatchedPaste initialPastes={watch.pastes} id={watch.id} onDescribe={(paste) => setDescribing(paste)} />
            </div>
          )}

          {empty && app ? (
            <AppEmptyState onPick={(s) => void submit(s)} disabled={send.isPending} />
          ) : empty ? (
            <>
              <EmptyState onPick={(s) => void submit(s)} disabled={send.isPending} />
              {/* Phones have no sidebar: the chats sit in the open under the suggestions. */}
              {(chats.length > 0 || pastes.length > 0) && (
                <div className="mb-6 flex flex-col gap-2 lg:hidden">
                  <h2 className="text-[12px] font-bold tracking-[0.06em] text-tm-text-3 uppercase">Your chats and links</h2>
                  <ChatHistoryList chats={chats} pastes={pastes} activeId={null} />
                </div>
              )}
            </>
          ) : (
            <ol className="flex flex-1 flex-col gap-6 pb-6" aria-live="polite">
              {messages.map((m) => (
                <li key={m.id}>
                  {m.role === "user" ? (
                    <UserBubble text={m.content} />
                  ) : (
                    <AssistantTurn text={m.content}>
                      {m.pasteIds.length > 0 && chat && (
                        <PasteBatchPanel
                          pastes={m.pasteIds.flatMap((id) => (chat.pastes[id] ? [chat.pastes[id]] : []))}
                          onDescribe={(paste) => setDescribing(paste)}
                        />
                      )}
                      {m.runIds.map((id) => {
                        const run = chat?.runs[id];
                        return run ? (
                          <ChatRunCard
                            key={id}
                            run={run}
                            buyerWhatsappNumber={chat?.buyerWhatsappNumber ?? null}
                            onAddToBag={onAddToBag}
                            onHandoff={recordFinderHandoff}
                          />
                        ) : null;
                      })}
                      {m.signIn && !signedIn ? <ChatSignInCard chatId={chat?.id ?? null} /> : null}
                    </AssistantTurn>
                  )}
                </li>
              ))}
              {pending && (
                <>
                  <li>
                    <UserBubble text={pending} />
                  </li>
                  <li>
                    <AssistantTurn typing />
                  </li>
                </>
              )}
            </ol>
          )}

          {chat && !chat.phone && hasWork && <WhatsappNumber onSave={savePhone} />}
          {chat?.phone && hasWork && (
            <p className="mb-3 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
              <WhatsappLogo size={14} aria-hidden />
              You can leave this page. We&apos;ll reach you on WhatsApp at {chat.phone}.
            </p>
          )}

          <AssistedRequestDialog
            open={describing != null}
            onOpenChange={(next) => !next && setDescribing(null)}
            extractionRequestId={describing?.id ?? null}
            productUrl={describing?.product_url ?? null}
            displayUrl={describing?.product_url ?? ""}
          />

          <div ref={endRef} />
          </div>
          <form
            onSubmit={onSubmit}
            className={cn(
              "z-10 -mx-1 rounded-[26px] bg-tm-paper/80 px-1 pb-1 backdrop-blur",
              app ? "shrink-0 pt-1" : signedIn ? "tm-chat-dock" : "tm-chat-dock-visitor",
            )}
          >
            <div className="tm-ask-ring rounded-[24px] p-[1.5px]">
              <div className="flex items-end gap-2 rounded-[22.5px] bg-card p-2 pl-4">
                <label htmlFor="finder-chat-input" className="sr-only">
                  Message the shopping assistant
                </label>
                <textarea
                  id="finder-chat-input"
                  ref={inputRef}
                  rows={1}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={onKeyDown}
                  maxLength={1000}
                  placeholder={empty ? "Paste a link, or say what you want" : app ? "Ask a follow-up or paste a link" : "Ask a follow-up, paste a link, or ask for something else"}
                  className={cn("max-h-40 min-h-[40px] flex-1 resize-none bg-transparent py-2 leading-6 outline-none placeholder:text-muted-foreground", app ? "max-h-28 text-[16px]" : "text-[16px] sm:text-[15px]")}
                />
                <button
                  type="submit"
                  disabled={!text.trim() || send.isPending}
                  aria-label="Send"
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[image:var(--tm-gradient-cta)] text-white transition-transform enabled:hover:scale-105 disabled:opacity-40"
                >
                  <ArrowUp size={18} weight="bold" aria-hidden />
                </button>
              </div>
            </div>
            {/* Kelvin, 2026-11-23: one line only, and it is the one that protects the customer. */}
            <p className={cn("mt-1.5 px-3 leading-snug text-muted-foreground", app ? "truncate text-[11.5px]" : "text-[12px]")}>
              Check the item on the store (size, colour, seller) before you buy.
            </p>
          </form>
        </section>
      </div>
    </MotionConfig>
  );
}

function NewChatButton({ compact = false }: { compact?: boolean }) {
  const routes = useAppRoutes();
  return (
    <Link
      href={routes.newChat}
      className={cn(
        "inline-flex items-center gap-2 rounded-full font-semibold transition-colors",
        compact ? "h-9 border border-tm-border bg-card px-3 text-[13px]" : "h-11 justify-center bg-tm-ink px-4 text-[14px] text-white hover:opacity-90",
      )}
    >
      <NotePencil size={compact ? 16 : 18} weight="bold" aria-hidden />
      New chat
    </Link>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <motion.div variants={riseIn} initial="hidden" animate="visible" className="flex justify-end">
      <p className="max-w-[85%] whitespace-pre-wrap [overflow-wrap:anywhere] rounded-3xl rounded-br-lg bg-tm-ink px-4 py-2.5 text-[15px] leading-relaxed text-white sm:max-w-[70%]">
        {text}
      </p>
    </motion.div>
  );
}

function AssistantTurn({ text, typing = false, children }: { text?: string; typing?: boolean; children?: React.ReactNode }) {
  return (
    <motion.div variants={riseIn} initial="hidden" animate="visible" className="flex gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[image:var(--tm-gradient-cta)] text-white">
        <Sparkle size={16} weight="fill" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {typing ? (
          <span className="flex h-8 items-center gap-1" aria-label="Thinking">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-2 animate-bounce rounded-full bg-tm-coral/70" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </span>
        ) : (
          <p className="whitespace-pre-wrap [overflow-wrap:anywhere] pt-1 text-[15px] leading-relaxed">{text}</p>
        )}
        {children}
      </div>
    </motion.div>
  );
}

/** The app's empty chat: one line and a row of suggestions, so the box below is what you see. */
function AppEmptyState({ onPick, disabled }: { onPick: (text: string) => void; disabled: boolean }) {
  return (
    <div className="flex h-full flex-col justify-end gap-4 pb-2">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[image:var(--tm-gradient-cta)] text-white">
          <Sparkle size={18} weight="fill" aria-hidden />
        </span>
        <p className="pt-1 text-[16px] leading-snug">
          <span className="font-semibold">What should we buy for you?</span>{" "}
          <span className="text-muted-foreground">Paste a link or say what you want. Prices land in cedis.</span>
        </p>
      </div>
      <ul className="-mx-3.5 flex gap-2 overflow-x-auto px-3.5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SUGGESTIONS.map((s) => (
          <li key={s} className="shrink-0">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(s)}
              className="max-w-[240px] truncate rounded-full border border-tm-border bg-card px-3.5 py-2 text-[13.5px] font-medium disabled:opacity-50"
            >
              {s}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyState({ onPick, disabled }: { onPick: (text: string) => void; disabled: boolean }) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-6 py-6 sm:py-12">
      <div className="flex flex-col gap-3">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-tm-tint px-3 py-1 text-[12.5px] font-semibold text-tm-coral-strong">
          <ChatsCircle size={15} weight="fill" aria-hidden />
          Shopping assistant
        </span>
        <h1 className="max-w-[20ch] font-display text-[32px] leading-[1.05] font-bold tracking-[-0.02em] sm:text-[42px]">
          What should we buy for you?
        </h1>
        <p className="max-w-[56ch] text-[15px] leading-relaxed text-muted-foreground">
          Paste a link from any US store, or tell me what you want, one thing or several. I find it new at Amazon,
          Walmart, eBay and Target and show the whole price landed in Accra, in cedis, before you pay.
        </p>
      </div>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <li key={s}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(s)}
              className="w-full rounded-2xl border border-tm-border bg-card px-4 py-3 text-left text-[14px] font-medium transition-colors hover:border-tm-coral/40 hover:bg-tm-tint disabled:opacity-50"
            >
              {s}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WhatsappNumber({ onSave }: { onSave: (phone: string) => Promise<unknown> }) {
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!phone.trim()) return;
        setSaving(true);
        try {
          await onSave(phone.trim());
          toast.success({ title: "Saved", description: "We'll reach you on WhatsApp about these." });
        } catch (error) {
          toast.error({ title: "Not saved", description: error instanceof Error ? error.message : "Try again." });
        } finally {
          setSaving(false);
        }
      }}
      className="mb-4 flex flex-col gap-2 rounded-2xl border border-tm-border bg-card p-3 sm:flex-row sm:items-center"
    >
      <label htmlFor="finder-chat-phone" className="flex items-center gap-1.5 text-[13px] font-medium sm:shrink-0">
        <WhatsappLogo size={16} weight="duotone" aria-hidden />
        Your WhatsApp number
      </label>
      <input
        id="finder-chat-phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="024 412 3456"
        className="h-10 min-w-0 flex-1 rounded-full border border-tm-border bg-background px-3 text-[14px] outline-none focus:border-tm-coral/50"
      />
      <button type="submit" disabled={saving} className="h-10 rounded-full bg-tm-ink px-4 text-[13px] font-semibold text-white disabled:opacity-50">
        Save
      </button>
    </form>
  );
}

/**
 * A visitor's free taste is used: sign in to keep going (2026-11-23). Both
 * routes bring them back to this chat, which moves to their account on sign-in.
 */
function ChatSignInCard({ chatId }: { chatId: string | null }) {
  const routes = useAppRoutes();
  const next = encodeURIComponent(chatId ? routes.chat(chatId) : routes.newChat);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-tm-coral/30 bg-tm-tint p-4">
      <p className="text-[14px] leading-snug font-semibold text-foreground">Keep going with a free Tomame account</p>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        Unlimited searches and link prices, your chats saved, and updates on WhatsApp once you order.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href={`/auth/signup?next=${next}`} className="tm-cta-gradient inline-flex h-10 items-center rounded-full px-5 text-[13px] font-bold text-white">
          Create a free account
        </Link>
        <Link href={`/auth/login?next=${next}`} className="inline-flex h-10 items-center rounded-full border border-tm-border bg-card px-5 text-[13px] font-semibold text-foreground">
          Sign in
        </Link>
      </div>
    </div>
  );
}
