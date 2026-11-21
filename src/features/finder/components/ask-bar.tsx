"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type ReactNode } from "react";
import { ArrowRight, CircleNotch, LinkSimple, Plus, Sparkle, X } from "@phosphor-icons/react/ssr";

import { hostOf } from "@/features/bag/components/format";
import { linksInText } from "@/features/extraction/components/batch-format";
import { readBatch, writeBatch } from "@/features/extraction/components/batch-storage";
import { useCreatePaste } from "@/features/extraction/hooks/usePastes";
import { PASTE_BATCH_MAX } from "@/features/extraction/services/paste-batch";
import { ApiFetchError } from "@/lib/api-client";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";

import { useStartFinder } from "../hooks/useFinder";

/** What a shopper might type, shown one at a time in the empty box. Never a price claim. */
const EXAMPLE_ASKS = ["PS5 Pro", "AirPods Pro 2 under GH₵3,000", "Nike Air Force 1, size 10", "iPhone 17 Pro Max 256GB", "Oraimo earbuds"];
const SUGGESTIONS = ["PS5 Pro", "AirPods Pro 2", "Stanley 40oz tumbler", "Kindle Paperwhite"];

/** The empty box's example, typed and erased one character at a time. Static under reduced motion. */
function useTypedExample(phrases: readonly string[], active: boolean): string {
  const [text, setText] = useState(phrases[0] ?? "");
  useEffect(() => {
    if (!active || phrases.length === 0) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let i = 0;
    let n = phrases[0]!.length;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const phrase = phrases[i]!;
      if (!deleting && n >= phrase.length) {
        deleting = true;
        timer = setTimeout(tick, 1700);
        return;
      }
      if (deleting && n === 0) {
        deleting = false;
        i = (i + 1) % phrases.length;
        timer = setTimeout(tick, 280);
        return;
      }
      n += deleting ? -1 : 1;
      setText(phrases[i]!.slice(0, n));
      timer = setTimeout(tick, deleting ? 22 : 55);
    };
    timer = setTimeout(tick, 1700);
    return () => clearTimeout(timer);
  }, [phrases, active]);
  return text;
}

export interface AskBarProps {
  /** Where links go: the paste flow, which reads `?url=` (several allowed). */
  pasteHref: string;
  /** Store names from the registry, for the "a link from …" examples. */
  stores?: readonly string[];
  inputId: string;
  formId?: string;
  /** Under the hint line, e.g. "Or search what we have already priced". Gets the typed text. */
  footer?: (typed: string, describing: boolean) => ReactNode;
  className?: string;
}

/**
 * Home's one box. Words start the AI price finder (`/app/find/[id]`); one or
 * more links go to the paste flow, which reads and prices each. Which of the
 * two will happen is shown before anyone presses: the badge, the hint line and
 * the button all follow `linksInText`, the same helper Buy for me uses.
 *
 * Nothing is priced here. The moving ring and the typed examples are
 * decoration (aria-hidden, still under reduced motion); the input keeps a real
 * label.
 */
interface AddedLink {
  id: string;
  host: string;
}

export function AskBar({ pasteHref, stores = [], inputId, formId, footer, className }: AskBarProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [added, setAdded] = useState<AddedLink[]>([]);
  const [adding, setAdding] = useState(false);
  const finder = useStartFinder();
  const createPaste = useCreatePaste();

  const typed = value.trim();
  const links = linksInText(typed);
  const isLink = links.length > 0;
  const describing = typed.length > 0 && !isLink;
  const room = PASTE_BATCH_MAX - added.length;

  const [phrases] = useState(() => {
    const linkLines = stores.slice(0, 3).map((s) => `Or paste a link from ${s}`);
    return EXAMPLE_ASKS.flatMap((ask, i) => (linkLines[i] ? [ask, linkLines[i]!] : [ask]));
  });
  const example = useTypedExample(phrases, typed.length === 0 && added.length === 0);

  /**
   * "+": the link starts reading now, joins this tab's batch (the one Buy for
   * me shows), and the box clears for the next. Nothing is priced here.
   */
  async function addLinks(next: string[]): Promise<boolean> {
    const take = next.slice(0, Math.max(0, room));
    if (take.length === 0) {
      toast.error({ title: `Up to ${PASTE_BATCH_MAX} links at a time`, description: "Price these first, then add more." });
      return false;
    }
    setAdding(true);
    const fresh: AddedLink[] = [];
    let repeats = 0;
    for (const link of take) {
      try {
        const paste = await createPaste.mutateAsync({ product_url: link });
        if (added.some((a) => a.id === paste.id) || fresh.some((a) => a.id === paste.id)) repeats += 1;
        else fresh.push({ id: paste.id, host: hostOf(paste.product_url) });
      } catch (error) {
        if (error instanceof ApiFetchError && error.status === 429) {
          toast.error({ title: "Please wait a few minutes", description: error.message });
          break;
        }
        toast.error({ title: "We couldn't take that link", description: error instanceof Error ? error.message : undefined });
      }
    }
    setAdding(false);
    if (fresh.length > 0) {
      const ids = fresh.map((f) => f.id);
      writeBatch([...readBatch().filter((id) => !ids.includes(id)), ...ids].slice(-PASTE_BATCH_MAX));
      setAdded((prev) => [...prev, ...fresh]);
      setValue("");
    } else if (repeats > 0) {
      toast.info({ title: repeats === 1 ? "That link is already in your list" : "Those links are already in your list" });
      setValue("");
    }
    inputRef.current?.focus();
    return fresh.length > 0 || repeats > 0;
  }

  function goToBatch() {
    router.push(pasteHref);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (describing) {
      finder.start(typed);
      return;
    }
    if (added.length > 0) {
      // Links still in the box join the batch first, then the batch opens.
      if (isLink && !(await addLinks(links))) return;
      goToBatch();
      return;
    }
    if (!typed) {
      inputRef.current?.focus();
      return;
    }
    const params = new URLSearchParams();
    for (const link of links.slice(0, PASTE_BATCH_MAX)) params.append("url", link);
    router.push(`${pasteHref}?${params.toString()}`);
  }

  /** Several links pasted at once become chips straight away. */
  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = linksInText(event.clipboardData.getData("text"));
    if (pasted.length < 2) return;
    event.preventDefault();
    void addLinks(pasted);
  }

  function fill(text: string) {
    setValue(text);
    finder.clearError();
    inputRef.current?.focus();
  }

  const total = added.length + (isLink ? links.length : 0);
  const busy = finder.pending || adding;
  const hint = describing
    ? "Searching by name: we'll show a good in-stock option fast, and keep looking for the best new price"
    : added.length > 0
      ? `${added.length} ${added.length === 1 ? "link" : "links"} reading now. Paste another and press +, or price them together`
      : isLink
        ? "Press + to add another link, or get the landed price now"
        : "Type what you want, or paste a link. Press + to add several links";

  const buttonLabel = describing
    ? finder.pending
      ? "Starting search"
      : "Search"
    : total > 1
      ? `Price ${Math.min(total, PASTE_BATCH_MAX)} items`
      : total === 1
        ? "Get landed price"
        : "Search";

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      <form
        id={formId}
        onSubmit={submit}
        data-busy={busy ? "true" : undefined}
        className="tm-ask-ring rounded-[22px] shadow-[0_18px_50px_-22px_rgba(242,91,61,0.45)]"
      >
        {/* The fill sits on this layer: in the ring's stacking context its glow paints over the form's own background. */}
        <div className="relative flex flex-col gap-2 rounded-[22px] bg-card p-2 sm:p-2 sm:pl-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-1">
            <div className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 px-2 sm:px-0">
              <span
                aria-hidden
                className={cn(
                  "relative grid size-10 shrink-0 place-items-center rounded-full transition-colors duration-300",
                  isLink || (added.length > 0 && !describing) ? "bg-tm-tint text-tm-coral-strong" : "bg-[image:var(--tm-gradient-cta)] text-white",
                )}
              >
                <Sparkle weight="fill" className={cn("absolute size-[19px] transition-all duration-300", isLink ? "scale-50 rotate-45 opacity-0" : "scale-100 opacity-100")} />
                <LinkSimple weight="bold" className={cn("absolute size-[19px] transition-all duration-300", isLink ? "scale-100 opacity-100" : "scale-50 -rotate-45 opacity-0")} />
              </span>
              <div className="relative min-w-0 flex-1">
                <label htmlFor={inputId} className="sr-only">
                  What you want to buy, or a product link
                </label>
                <input
                  ref={inputRef}
                  id={inputId}
                  name="q"
                  type="text"
                  inputMode={isLink ? "url" : "search"}
                  enterKeyHint={describing ? "search" : "go"}
                  autoComplete="off"
                  spellCheck={false}
                  value={value}
                  onPaste={onPaste}
                  onChange={(e) => {
                    setValue(e.target.value);
                    if (finder.error) finder.clearError();
                  }}
                  className="h-11 w-full min-w-0 bg-transparent text-[17px] leading-none text-tm-ink outline-none"
                />
                {value.length === 0 && (
                  <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center overflow-hidden text-[17px] leading-none whitespace-nowrap text-tm-text-3">
                    {added.length > 0 ? (
                      <span className="truncate">Paste the next link, or type what you want</span>
                    ) : (
                      <>
                        <span className="truncate">{example}</span>
                        <span className="tm-ask-caret" />
                      </>
                    )}
                  </span>
                )}
              </div>
              {/* "+" is always there so it can be found; it wakes once there is a link to take. */}
              {room > 0 && (
                <button
                  type="button"
                  onClick={() => void addLinks(links)}
                  disabled={!isLink || adding}
                  aria-label="Add this link and paste another"
                  title="Add this link and paste another"
                  className={cn(
                    "grid size-11 shrink-0 place-items-center rounded-full border transition-all outline-none focus-visible:ring-2 focus-visible:ring-tm-coral/40",
                    isLink ? "border-tm-coral/50 bg-tm-tint text-tm-coral-strong hover:scale-105" : "border-tm-border text-tm-text-3",
                    "disabled:cursor-not-allowed",
                  )}
                >
                  {adding ? <CircleNotch weight="bold" className="size-5 animate-spin" aria-hidden /> : <Plus weight="bold" className="size-5" aria-hidden />}
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={busy}
              aria-busy={busy || undefined}
              className={cn(
                "tm-cta-gradient inline-flex h-[52px] shrink-0 items-center justify-center gap-2 rounded-[15px] px-6",
                "text-[15px] leading-none font-bold transition-transform hover:scale-[1.02] active:scale-[0.99]",
                "outline-none focus-visible:ring-3 focus-visible:ring-tm-coral/40 focus-visible:ring-offset-1 focus-visible:ring-offset-card",
                "disabled:cursor-wait disabled:opacity-80 disabled:hover:scale-100",
              )}
            >
              {buttonLabel}
              {describing ? <Sparkle weight="fill" className="size-4" aria-hidden /> : <ArrowRight weight="bold" className="size-4" aria-hidden />}
            </button>
          </div>

          {added.length > 0 && (
            <ul aria-label="Links added" className="flex flex-wrap gap-1.5 px-2 pb-1">
              {added.map((a, i) => (
                <li
                  key={a.id}
                  className="tm-up inline-flex items-center gap-1.5 rounded-full border border-tm-pill-border bg-tm-pill-bg py-1 pr-1 pl-2.5 text-[13px] font-semibold text-tm-ink"
                  style={{ animationDelay: `${Math.min(i, 3) * 40}ms` }}
                >
                  <CircleNotch weight="bold" className="size-3.5 animate-spin text-tm-coral" aria-hidden />
                  <span className="max-w-[16ch] truncate">{a.host}</span>
                  <span className="sr-only">reading</span>
                  <button
                    type="button"
                    onClick={() => {
                      setAdded((prev) => prev.filter((x) => x.id !== a.id));
                      writeBatch(readBatch().filter((id) => id !== a.id));
                    }}
                    aria-label={`Remove ${a.host}`}
                    className="grid size-6 place-items-center rounded-full text-tm-text-3 outline-none hover:bg-card hover:text-tm-ink focus-visible:ring-2 focus-visible:ring-tm-coral/40"
                  >
                    <X weight="bold" className="size-3" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </form>

      <p aria-live="polite" className="flex items-center gap-1.5 px-2 text-[13px] leading-snug font-medium text-tm-text-2">
        {finder.error ? <span role="alert" className="text-destructive">{finder.error}</span> : hint}
      </p>

      {typed.length === 0 && added.length === 0 ? (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <span className="px-1 text-[12px] font-semibold tracking-[0.06em] text-tm-text-3 uppercase">Try</span>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => fill(s)}
              className="rounded-full border border-tm-pill-border bg-tm-pill-bg px-3 py-1.5 text-[13px] font-semibold text-tm-ink transition-all outline-none hover:-translate-y-px hover:border-tm-coral/40 focus-visible:ring-2 focus-visible:ring-tm-coral/40"
            >
              {s}
            </button>
          ))}
        </div>
      ) : (
        footer?.(typed, describing)
      )}
    </div>
  );
}
