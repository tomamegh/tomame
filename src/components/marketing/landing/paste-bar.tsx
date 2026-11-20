"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight, LinkSimple, Sparkle } from "@phosphor-icons/react/ssr";

import { Button } from "@/components/ui/button";
import { linksInText } from "@/features/extraction/components/batch-format";
import { buyForMeHref, looksLikeUrl } from "@/features/extraction/components/buy-for-me-mode";
import { useStartFinder } from "@/features/finder/hooks/useFinder";
import { PASTE_BATCH_MAX } from "@/features/extraction/services/paste-batch";
import { cn } from "@/lib/utils";

export interface PasteBarProps {
  className?: string;
}

/**
 * The hero's one box, the same as Buy for me's: a link (or several) is
 * priced, anything else is searched against what we have already priced.
 * It only hands over; the extraction and all pricing happen server-side.
 */
export function PasteBar({ className }: PasteBarProps) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const typed = value.trim();
  const links = linksInText(typed);
  const isText = typed.length > 0 && links.length === 0 && !looksLikeUrl(typed);
  // Words, not a link: "Find it for me" starts a price finder run (105).
  const finder = useStartFinder();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!typed) {
      router.push(buyForMeHref("paste"));
      return;
    }
    if (isText) {
      finder.start(typed);
      return;
    }
    const params = new URLSearchParams();
    for (const link of (links.length > 0 ? links : [typed]).slice(0, PASTE_BATCH_MAX)) params.append("url", link);
    router.push(`${buyForMeHref("paste")}?${params.toString()}`);
  }

  return (
    <div className={cn("flex w-full max-w-[600px] flex-col gap-2", className)}>
      <form
        onSubmit={handleSubmit}
        className={cn(
          "flex w-full flex-col gap-2 rounded-[20px] border border-border bg-card p-1.5",
          "shadow-[0_14px_40px_-18px_rgba(242,91,61,0.35)] sm:flex-row sm:items-center sm:gap-0",
          "transition-colors focus-within:border-tm-coral/50",
        )}
      >
        <label htmlFor="hero-product-url" className="sr-only">
          Product link, or what you are looking for
        </label>
        <div className="flex min-h-[52px] min-w-0 flex-1 items-center gap-2.5 px-3.5">
          {isText ? (
            <Sparkle weight="fill" className="size-5 shrink-0 text-tm-coral" aria-hidden />
          ) : (
            <LinkSimple weight="bold" className="size-5 shrink-0 text-tm-coral" aria-hidden />
          )}
          <input
            id="hero-product-url"
            name="url"
            inputMode={isText ? "search" : "url"}
            autoComplete="off"
            enterKeyHint={isText ? "search" : "go"}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Paste a link or describe what you want"
            className="w-full min-w-0 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground sm:text-[15px]"
          />
        </div>
        <Button type="submit" variant="primary" size="lg" className="shrink-0 sm:h-[50px]" disabled={finder.pending} loading={finder.pending}>
          {isText ? (finder.pending ? "Starting" : "Find it for me") : links.length > 1 ? `Price ${Math.min(links.length, PASTE_BATCH_MAX)} links` : "See landed price"}
          {!finder.pending && <ArrowRight weight="bold" className="size-4" aria-hidden />}
        </Button>
      </form>
      {finder.error && (
        <p role="alert" className="px-2 text-[13px] font-medium text-destructive">
          {finder.error}
        </p>
      )}
    </div>
  );
}
