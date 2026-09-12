"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight, LinkSimple } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";

const QUOTE_ROUTE = "/app/orders/new";

export interface PasteBarProps {
  className?: string;
}

/**
 * The hero's paste bar. The only interactive island in the hero: it hands the
 * link straight to the public quote flow, which does the extraction and all
 * pricing server-side. Nothing is calculated here.
 */
export function PasteBar({ className }: PasteBarProps) {
  const router = useRouter();
  const [url, setUrl] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = url.trim();
    router.push(
      trimmed
        ? `${QUOTE_ROUTE}?url=${encodeURIComponent(trimmed)}`
        : QUOTE_ROUTE,
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "flex w-full max-w-[600px] flex-col gap-2 rounded-[18px] border-[1.5px] border-tm-border bg-card p-[5px]",
        "shadow-[0_14px_40px_-16px_rgba(242,91,61,0.35)] sm:h-[60px] sm:flex-row sm:items-center sm:gap-0",
        "focus-within:border-tm-coral/50",
        className,
      )}
    >
      <label htmlFor="hero-product-url" className="sr-only">
        Product link
      </label>
      <div className="flex min-w-0 flex-1 items-center gap-2.5 px-3.5 py-3 sm:py-0">
        <LinkSimple
          weight="duotone"
          className="size-5 shrink-0 text-tm-coral"
          aria-hidden
        />
        <input
          id="hero-product-url"
          name="url"
          type="url"
          inputMode="url"
          autoComplete="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="Paste a product link…"
          className="w-full min-w-0 bg-transparent text-[15px] text-tm-ink outline-none placeholder:text-tm-text-3"
        />
      </div>
      <button
        type="submit"
        className={cn(
          "tm-cta-gradient inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[13px] px-5.5",
          "text-[15px] font-bold transition-transform hover:scale-[1.02] active:scale-[0.99]",
          "outline-none focus-visible:ring-3 focus-visible:ring-tm-coral/40 focus-visible:ring-offset-1 focus-visible:ring-offset-card",
          "sm:h-[50px]",
        )}
      >
        See landed price
        <ArrowRight weight="bold" className="size-4" aria-hidden />
      </button>
    </form>
  );
}
