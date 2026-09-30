"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FadersHorizontal, Star } from "@phosphor-icons/react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { ShopFacets } from "../../services/catalog-shop.service";
import {
  conditionLabel,
  shopHref,
  type ShopCondition,
  type ShopRating,
  type ShopState,
} from "../../shop-params";
import type { CatalogStore } from "../../types";
import { CATALOG_STORE_LABEL } from "../format";

/**
 * The phone's filters: the same facets as the desktop sidebar, in a sheet.
 *
 * CHOOSE SEVERAL, THEN APPLY. On a phone the grid is behind the sheet, so an
 * instant navigation per tap would close it after every choice. The sheet holds
 * the choices locally and one "Show results" writes them all into the address
 * with `shopHref` — the same builder every link on the page uses, so the result
 * is the same URL a desktop visitor gets by clicking the sidebar.
 *
 * The counts are the counts for the CURRENT filters, as the sidebar's are; they
 * do not recount as boxes are ticked, and the copy does not pretend they do.
 */
export function ShopFilterSheet({
  state,
  facets,
  activeCount,
  className,
}: {
  state: ShopState;
  facets: ShopFacets;
  activeCount: number;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string | null>(state.category);
  const [stores, setStores] = useState<CatalogStore[]>(state.stores);
  const [conditions, setConditions] = useState<ShopCondition[]>(
    state.conditions,
  );
  const [rating, setRating] = useState<ShopRating | null>(state.rating);
  const [min, setMin] = useState(
    state.minGhs != null ? String(state.minGhs) : "",
  );
  const [max, setMax] = useState(
    state.maxGhs != null ? String(state.maxGhs) : "",
  );

  const reset = () => {
    setCategory(state.category);
    setStores(state.stores);
    setConditions(state.conditions);
    setRating(state.rating);
    setMin(state.minGhs != null ? String(state.minGhs) : "");
    setMax(state.maxGhs != null ? String(state.maxGhs) : "");
  };

  const toBound = (raw: string) => {
    const n = Math.round(Number(raw.replace(/[^\d.]/g, "")));
    return raw.trim() && Number.isFinite(n) && n > 0 ? n : null;
  };

  const apply = () => {
    let lo = toBound(min);
    let hi = toBound(max);
    if (lo != null && hi != null && lo > hi) [lo, hi] = [hi, lo];
    setOpen(false);
    router.push(
      shopHref(state, {
        category,
        stores,
        conditions,
        rating,
        minGhs: lo,
        maxGhs: hi,
      }),
      { scroll: false },
    );
  };

  const clear = () => {
    setCategory(null);
    setStores([]);
    setConditions([]);
    setRating(null);
    setMin("");
    setMax("");
  };

  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        // Reopening starts from what is applied, not from choices abandoned last time.
        if (next) reset();
        setOpen(next);
      }}
    >
      <SheetTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-[12px] border-[1.5px] border-tm-border bg-card px-3.5 text-[13.5px] leading-none font-bold tracking-[0.02em] text-tm-ink uppercase transition-colors",
            "hover:border-tm-coral focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none",
            className,
          )}
        >
          <FadersHorizontal weight="bold" className="size-4" aria-hidden />
          Filter
          {activeCount > 0 && (
            <span className="tm-nums flex h-5 min-w-5 items-center justify-center rounded-full bg-tm-coral px-1.5 text-[11px] text-white">
              {activeCount}
              <span className="sr-only"> active</span>
            </span>
          )}
        </button>
      </SheetTrigger>

      <SheetContent
        side="bottom"
        className="max-h-[88dvh] gap-0 rounded-t-[24px] border-tm-border bg-tm-paper p-0 text-tm-ink"
      >
        <SheetHeader className="border-b border-tm-border px-5 pt-5 pb-4">
          <SheetTitle className="font-display text-[20px] font-bold">
            Filter
          </SheetTitle>
          <SheetDescription className="text-[13px] text-tm-text-2">
            Counts are for the filters you have on now.
          </SheetDescription>
        </SheetHeader>

        <form
          id="shop-filter-sheet"
          data-shop-form
          className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-5 py-5"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <SheetGroup title="Categories">
            <Choice
              type="radio"
              name="category"
              checked={category == null}
              onChange={() => setCategory(null)}
              label="All categories"
            />
            {facets.departments.map((d) => (
              <Choice
                key={d.value}
                type="radio"
                name="category"
                checked={category === d.value}
                onChange={() => setCategory(d.value)}
                label={d.value}
                count={d.count}
              />
            ))}
          </SheetGroup>

          <SheetGroup title="Store">
            {facets.stores.map((s) => (
              <Choice
                key={s.value}
                type="checkbox"
                name="store"
                checked={stores.includes(s.value)}
                onChange={() => setStores((list) => toggle(list, s.value))}
                label={CATALOG_STORE_LABEL[s.value]}
                count={s.count}
              />
            ))}
          </SheetGroup>

          <SheetGroup title="Price, landed in GH₵">
            <div className="flex flex-wrap gap-2">
              {facets.prices
                .filter((p) => p.count > 0)
                .map((p) => {
                  const on =
                    toBound(min) === p.bucket.min &&
                    toBound(max) === p.bucket.max;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        setMin(
                          on || p.bucket.min == null
                            ? ""
                            : String(p.bucket.min),
                        );
                        setMax(
                          on || p.bucket.max == null
                            ? ""
                            : String(p.bucket.max),
                        );
                      }}
                      className={cn(
                        "h-9 rounded-full border-[1.5px] px-3 text-[13px] font-semibold transition-colors",
                        on
                          ? "border-tm-coral bg-tm-tint text-tm-coral-strong"
                          : "border-tm-border bg-card text-tm-ink",
                      )}
                    >
                      {p.bucket.label}
                      <span className="tm-nums ml-1.5 text-[11.5px] font-medium text-tm-text-3">
                        {p.count}
                      </span>
                    </button>
                  );
                })}
            </div>
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-[12px] font-semibold text-tm-text-3">
                  Min GH₵
                </span>
                <input
                  inputMode="numeric"
                  value={min}
                  onChange={(e) => setMin(e.target.value)}
                  placeholder={facets.range ? String(facets.range.min) : "0"}
                  className="h-11 w-full min-w-0 rounded-[12px] border border-tm-border bg-card px-3 text-base font-medium placeholder:text-tm-text-3 focus:border-tm-coral focus:outline-none"
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-[12px] font-semibold text-tm-text-3">
                  Max GH₵
                </span>
                <input
                  inputMode="numeric"
                  value={max}
                  onChange={(e) => setMax(e.target.value)}
                  placeholder={facets.range ? String(facets.range.max) : "Any"}
                  className="h-11 w-full min-w-0 rounded-[12px] border border-tm-border bg-card px-3 text-base font-medium placeholder:text-tm-text-3 focus:border-tm-coral focus:outline-none"
                />
              </label>
            </div>
          </SheetGroup>

          {(facets.ratings.some((r) => r.count > 0) ||
            state.rating != null) && (
            <SheetGroup title="Rating" note="Amazon and Walmart listings">
              <Choice
                type="radio"
                name="rating"
                checked={rating == null}
                onChange={() => setRating(null)}
                label="Any rating"
              />
              {facets.ratings.map((r) => (
                <Choice
                  key={r.value}
                  type="radio"
                  name="rating"
                  checked={rating === r.value}
                  onChange={() => setRating(r.value)}
                  label={
                    <span className="inline-flex items-center gap-1">
                      {r.value}
                      <Star
                        weight="fill"
                        className="size-3 text-tm-coral"
                        aria-hidden
                      />
                      &amp; up<span className="sr-only"> stars</span>
                    </span>
                  }
                  count={r.count}
                />
              ))}
            </SheetGroup>
          )}

          {(facets.conditions.some((c) => c.count > 0) ||
            state.conditions.length > 0) && (
            <SheetGroup title="Condition" note="eBay listings">
              {facets.conditions.map((c) => (
                <Choice
                  key={c.value}
                  type="checkbox"
                  name="condition"
                  checked={conditions.includes(c.value)}
                  onChange={() =>
                    setConditions((list) => toggle(list, c.value))
                  }
                  label={conditionLabel(c.value)}
                  count={c.count}
                />
              ))}
            </SheetGroup>
          )}
        </form>

        {/* A plain div, not `SheetFooter`: `cn()` merges its `p-4` over an env() padding and drops it. */}
        <div className="flex gap-3 border-t border-tm-border bg-card px-5 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={clear}
            className="h-12 flex-1 rounded-[14px] border-[1.5px] border-tm-border bg-card text-[14px] font-semibold text-tm-ink focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:outline-none"
          >
            Clear all
          </button>
          <button
            type="submit"
            form="shop-filter-sheet"
            className="tm-cta-gradient h-12 flex-[2] rounded-[14px] text-[15px] font-bold text-white focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Show results
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SheetGroup({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1">
      <legend className="mb-2 flex w-full items-baseline justify-between text-[12px] leading-none font-bold tracking-[0.04em] text-tm-text-3 uppercase">
        {title}
        {note && (
          <span className="text-[11px] font-medium tracking-normal normal-case">
            {note}
          </span>
        )}
      </legend>
      {children}
    </fieldset>
  );
}

function Choice({
  type,
  name,
  checked,
  onChange,
  label,
  count,
}: {
  type: "checkbox" | "radio";
  name: string;
  checked: boolean;
  onChange: () => void;
  label: React.ReactNode;
  count?: number;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] px-1 text-[14.5px] font-medium">
      <input
        type={type}
        name={name}
        checked={checked}
        onChange={onChange}
        className="size-[18px] shrink-0 accent-[var(--tm-coral)]"
      />
      <span className="min-w-0 flex-1 break-words">{label}</span>
      {count != null && (
        <span className="tm-nums shrink-0 text-[12.5px] text-tm-text-3">
          {count}
        </span>
      )}
    </label>
  );
}
