"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, ClipboardText, LinkSimple, Sparkle } from "@phosphor-icons/react/ssr";

import { linksInText } from "@/features/extraction/components/batch-format";
import { PASTE_BATCH_MAX } from "@/features/extraction/services/paste-batch";
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
export function AskBar({ pasteHref, stores = [], inputId, formId, footer, className }: AskBarProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const finder = useStartFinder();

  const typed = value.trim();
  const links = linksInText(typed);
  const isLink = links.length > 0;
  const describing = typed.length > 0 && !isLink;

  const [phrases] = useState(() => {
    const linkLines = stores.slice(0, 3).map((s) => `Or paste a link from ${s}`);
    return EXAMPLE_ASKS.flatMap((ask, i) => (linkLines[i] ? [ask, linkLines[i]!] : [ask]));
  });
  const example = useTypedExample(phrases, typed.length === 0);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!typed) {
      inputRef.current?.focus();
      return;
    }
    if (describing) {
      finder.start(typed);
      return;
    }
    const params = new URLSearchParams();
    for (const link of links.slice(0, PASTE_BATCH_MAX)) params.append("url", link);
    router.push(`${pasteHref}?${params.toString()}`);
  }

  function fill(text: string) {
    setValue(text);
    finder.clearError();
    inputRef.current?.focus();
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) fill(text.trim());
    } catch {
      inputRef.current?.focus();
    }
  }

  const hint = isLink
    ? links.length === 1
      ? "Link found: we'll read the store page and price it landed in Accra"
      : `${Math.min(links.length, PASTE_BATCH_MAX)} links found: we'll read each one and price them together`
    : describing
      ? "AI search: we'll look across Amazon, Walmart and eBay for the best new price, landed in Accra"
      : "Describe what you want, or paste one or more product links";

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      <form
        id={formId}
        onSubmit={submit}
        data-busy={finder.pending ? "true" : undefined}
        className="tm-ask-ring rounded-[22px] shadow-[0_18px_50px_-22px_rgba(242,91,61,0.45)]"
      >
        {/* The fill sits on this layer: in the ring's stacking context its glow paints over the form's own background. */}
        <div className="relative flex flex-col gap-2 rounded-[22px] bg-card p-2 sm:flex-row sm:items-center sm:gap-1 sm:p-2 sm:pl-3">
          <div className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 px-2 sm:px-0">
            <span
              aria-hidden
              className={cn(
                "relative grid size-10 shrink-0 place-items-center rounded-full transition-colors duration-300",
                isLink ? "bg-tm-tint text-tm-coral-strong" : "bg-[image:var(--tm-gradient-cta)] text-white",
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
                onChange={(e) => {
                  setValue(e.target.value);
                  if (finder.error) finder.clearError();
                }}
                className="h-11 w-full min-w-0 bg-transparent text-[17px] leading-none text-tm-ink outline-none"
              />
              {typed.length === 0 && value.length === 0 && (
                <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center overflow-hidden text-[17px] leading-none whitespace-nowrap text-tm-text-3">
                  <span className="truncate">{example}</span>
                  <span className="tm-ask-caret" />
                </span>
              )}
            </div>
            {typed.length === 0 && (
              <button
                type="button"
                onClick={pasteFromClipboard}
                className="hidden shrink-0 items-center gap-1.5 rounded-full border border-tm-border px-3 py-1.5 text-[13px] font-semibold text-tm-text-2 transition-colors outline-none hover:border-tm-coral/40 hover:text-tm-ink focus-visible:ring-2 focus-visible:ring-tm-coral/40 sm:inline-flex"
              >
                <ClipboardText weight="bold" className="size-4" aria-hidden />
                Paste
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={finder.pending}
            aria-busy={finder.pending || undefined}
            className={cn(
              "tm-cta-gradient inline-flex h-[52px] shrink-0 items-center justify-center gap-2 rounded-[15px] px-6",
              "text-[15px] leading-none font-bold transition-transform hover:scale-[1.02] active:scale-[0.99]",
              "outline-none focus-visible:ring-3 focus-visible:ring-tm-coral/40 focus-visible:ring-offset-1 focus-visible:ring-offset-card",
              "disabled:cursor-wait disabled:opacity-80 disabled:hover:scale-100",
            )}
          >
            {describing ? (finder.pending ? "Starting search" : "Find best price") : isLink ? (links.length > 1 ? `Price ${Math.min(links.length, PASTE_BATCH_MAX)} items` : "Get landed price") : "Search"}
            {describing ? <Sparkle weight="fill" className="size-4" aria-hidden /> : <ArrowRight weight="bold" className="size-4" aria-hidden />}
          </button>
        </div>
      </form>

      <p aria-live="polite" className="flex items-center gap-1.5 px-2 text-[13px] leading-snug font-medium text-tm-text-2">
        {finder.error ? <span role="alert" className="text-destructive">{finder.error}</span> : hint}
      </p>

      {typed.length === 0 ? (
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
