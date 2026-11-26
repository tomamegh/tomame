"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { ScrapedProduct } from "@/features/extraction/scrapers/types";
import { choiceForPick, valueState, variantChoicesOf } from "@/features/extraction/variant-choices";
import { apiFetch } from "@/lib/api-client";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import type { ApiSuccessResponse } from "@/types/api";

export interface VariantPickerCardProps {
  extractionId: string;
  product: ScrapedProduct;
  /** A re-price is running; picks wait for it. */
  busy: boolean;
}

/**
 * Size, colour and any other option the store sells, as buttons. A pick asks
 * the server for the quote of that variant (the store's own link for it) and
 * moves the screen there, so the price shown is always a server read of exactly
 * what we will buy. Renders nothing when the store did not publish its variants.
 */
export function VariantPickerCard({ extractionId, product, busy }: VariantPickerCardProps) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const choices = variantChoicesOf(product);
  if (!choices) return null;

  const selected = choices.choices.find((c) => c.id === choices.selectedId) ?? null;

  const pick = (option: string, value: string) => {
    const next = choiceForPick(choices, option, value);
    if (!next || next.id === choices.selectedId || pending) return;
    setPending(`${option}:${value}`);
    apiFetch<ApiSuccessResponse<{ extraction_cache_id: string }>>(`/api/extractions/${extractionId}/variant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variant_id: next.id }),
    })
      .then((response) => {
        router.replace(`/app/orders/review/${response.data.extraction_cache_id}`, { scroll: false });
      })
      .catch((error: unknown) => {
        toast.error({
          title: "Could not change the option",
          description: error instanceof Error ? error.message : "Please try again.",
        });
      })
      .finally(() => setPending(null));
  };

  return (
    <section className="flex flex-col gap-4 rounded-[18px] border border-border bg-card p-[18px] sm:col-span-2" aria-busy={pending != null}>
      {choices.options.map((option) => (
        <div key={option.name} className="flex flex-col gap-2.5">
          <h2 className="text-sm leading-none font-semibold">
            {option.name}
            {selected?.options[option.name] && (
              <span className="font-normal text-tm-text-3"> · {selected.options[option.name]}</span>
            )}
          </h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label={option.name}>
            {option.values.map((value) => {
              const state = valueState(choices, option.name, value);
              const isPending = pending === `${option.name}:${value}`;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={state === "selected"}
                  disabled={state === "sold_out" || pending != null || busy}
                  onClick={() => pick(option.name, value)}
                  title={state === "sold_out" ? "Sold out" : undefined}
                  className={cn(
                    "min-h-9 rounded-full border px-3.5 py-1.5 text-xs leading-none transition-colors",
                    state === "selected"
                      ? "border-tm-coral bg-tm-tint font-semibold text-tm-coral-strong"
                      : "border-border bg-[var(--tm-pill-bg)] font-medium text-foreground hover:border-tm-coral/60",
                    state === "sold_out" && "cursor-not-allowed text-muted-foreground line-through opacity-60 hover:border-border",
                    isPending && "animate-pulse border-tm-coral",
                    (pending != null || busy) && state !== "selected" && state !== "sold_out" && "cursor-wait",
                  )}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-xs leading-snug text-tm-text-3">
        {pending ? "Getting the store's price for that option…" : "The price updates to the option you pick. Crossed-out options are sold out."}
      </p>
    </section>
  );
}
