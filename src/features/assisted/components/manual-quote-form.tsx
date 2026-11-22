"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { TomameCategory } from "@/config/categories";
import type { AssistedRequestRow } from "@/db/queries/assisted-requests";
import { ApiFetchError } from "@/lib/api-client";
import { toast } from "@/lib/sonner";
import { usePriceManualQuote } from "../hooks/useAssistedQueue";

const CATEGORIES = Object.values(TomameCategory).sort((a, b) => a.localeCompare(b));
const FIELD =
  "h-9 w-full rounded-[10px] border border-tm-border bg-tm-paper px-3 text-[13px] text-tm-ink focus-visible:border-tm-coral/50 focus-visible:outline-none";

/**
 * A buyer's answer to a failed paste (110): the store's price, the category and
 * a weight when the category is priced by weight. The engine strikes the cedi
 * total; the customer's chat card becomes the quote.
 */
export function ManualQuoteForm({ row }: { row: AssistedRequestRow }) {
  const price = usePriceManualQuote();
  const [priceUsd, setPriceUsd] = useState("");
  const [category, setCategory] = useState("");
  const [weight, setWeight] = useState("");
  const [title, setTitle] = useState("");

  const submit = () => {
    const usd = Number.parseFloat(priceUsd);
    const lbs = weight.trim() ? Number.parseFloat(weight) : null;
    if (!(usd > 0)) return toast.error({ title: "Enter the store's price in USD" });
    if (!category) return toast.error({ title: "Pick the category" });
    if (lbs != null && !(lbs > 0)) return toast.error({ title: "The weight must be a number of pounds" });
    price.mutate(
      { id: row.id, price_usd: usd, category, weight_lbs: lbs, title: title.trim() || null },
      {
        onSuccess: () => toast.success({ title: "Priced. The quote is in the customer's chat." }),
        onError: (error) => toast.error({ title: "Couldn't price it", description: error instanceof ApiFetchError || error instanceof Error ? error.message : undefined }),
      },
    );
  };

  return (
    <fieldset className="flex flex-col gap-2.5 rounded-[12px] bg-tm-paper/60 p-3">
      <legend className="px-1 text-[12px] font-semibold text-tm-text-2">Price it by hand</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[120px_minmax(0,1fr)_110px]">
        <input className={FIELD} inputMode="decimal" placeholder="Price, USD" value={priceUsd} onChange={(e) => setPriceUsd(e.target.value)} aria-label="Store price in USD" />
        <select className={FIELD} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="">Category…</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input className={FIELD} inputMode="decimal" placeholder="Weight, lb" value={weight} onChange={(e) => setWeight(e.target.value)} aria-label="Weight in pounds (optional)" />
      </div>
      <input className={FIELD} placeholder="Product name (optional, if the page had none)" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Product name" maxLength={300} />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={submit} disabled={price.isPending} aria-busy={price.isPending} className="tm-cta-gradient rounded-full border-0 text-white hover:opacity-90">
          {price.isPending ? "Pricing…" : "Send the quote"}
        </Button>
        <span className="text-[12px] text-tm-text-3">The customer sees the full breakdown and a 24-hour free quote.</span>
      </div>
    </fieldset>
  );
}
