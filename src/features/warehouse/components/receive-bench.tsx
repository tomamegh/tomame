"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckIcon, InboxIcon, PackagePlusIcon, ScaleIcon, SearchIcon, XIcon } from "lucide-react";

import { AdminButton } from "@/components/layout/admin/controls";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";

import type { ItemStage, WarehouseItem } from "../types";
import { STAGE_META, formatLbs, formatRelative, groupByRecipient, matchesQuery, pluralise, recipientPlace } from "./format";
import { ReceiveDialog } from "./receive-dialog";
import { PackItemsButton, errorText, warehouseRequest } from "./warehouse-actions";
import { ItemFlags, ItemThumb, StageBadge } from "./warehouse-ui";

/**
 * The receiving bench (081): filter, find, log in, and pick items to pack.
 *
 * The search box is also the scanner input. A handheld scanner is a keyboard
 * that types fast and presses Enter, so scanning an order number here and
 * hitting Enter opens that parcel's log-in dialog directly — the operator never
 * has to find the row.
 *
 * Items are grouped by the person they belong to, because that is how a box is
 * packed: one customer's items together, sent to one door.
 */

interface OpenPackage {
  id: string;
  reference: string;
  unit_count: number;
  recipients: string[];
}

type StageFilter = ItemStage | "all";

const FILTERS: Array<{ value: StageFilter; label: string }> = [
  { value: "all", label: "Everything" },
  { value: "awaiting", label: "Expected" },
  { value: "received", label: "On the shelf" },
  { value: "packed", label: "Packed" },
];

export function ReceiveBench({
  items,
  openPackages,
  initialStage,
  initialQuery,
}: {
  items: WarehouseItem[];
  openPackages: OpenPackage[];
  initialStage: StageFilter;
  initialQuery: string;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<StageFilter>(initialStage);
  const [query, setQuery] = useState(initialQuery);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [receiving, setReceiving] = useState<WarehouseItem | null>(null);
  const [adding, setAdding] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => {
    const c: Record<StageFilter, number> = { all: items.length, awaiting: 0, received: 0, packed: 0, shipped: 0 };
    for (const item of items) c[item.stage] += 1;
    return c;
  }, [items]);

  const visible = useMemo(
    () => items.filter((i) => (stage === "all" || i.stage === stage) && matchesQuery(i, query)),
    [items, stage, query],
  );
  const groups = useMemo(() => groupByRecipient(visible), [visible]);
  const selectable = (i: WarehouseItem) => !i.package && !i.held;
  const selectedIds = [...selected];

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleGroup = (group: WarehouseItem[]) => {
    const ids = group.filter(selectable).map((i) => i.order_id);
    const allOn = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const onSearchKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    const code = query.trim().toUpperCase().replace(/\s+/g, "");
    const exact = items.find((i) => i.order_no.toUpperCase() === code || i.order_no.replace("-", "") === code);
    if (exact) {
      event.preventDefault();
      if (exact.stage === "awaiting" || exact.stage === "received") setReceiving(exact);
      else router.push(`/warehouse/items/${exact.order_id}`);
      setQuery("");
    }
  };

  const addToExisting = async (pkg: OpenPackage) => {
    setAdding(true);
    try {
      await warehouseRequest(`/api/warehouse/packages/${pkg.id}/items`, "POST", { order_ids: selectedIds });
      toast.success({ title: `Added to ${pkg.reference}`, description: pluralise(selectedIds.length, "item") + " packed." });
      setSelected(new Set());
      router.push(`/warehouse/packages/${pkg.id}`);
      router.refresh();
    } catch (error) {
      toast.error({ title: "Could not add them", description: errorText(error) });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Filters + scanner-friendly search */}
      <div className="tm-up flex flex-col gap-3 [animation-duration:0.5s] lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0 lg:pb-0">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStage(f.value)}
              aria-pressed={stage === f.value}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold transition-colors",
                stage === f.value
                  ? "border-tm-ink bg-tm-ink text-white"
                  : "border-tm-border bg-card text-tm-text-2 hover:text-tm-ink",
              )}
            >
              {f.label}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[11px] leading-none font-bold",
                  stage === f.value ? "bg-white/20 text-white" : "bg-tm-paper text-tm-text-3",
                )}
              >
                {counts[f.value]}
              </span>
            </button>
          ))}
        </div>
        <label className="relative flex w-full items-center lg:w-[360px]">
          <SearchIcon className="pointer-events-none absolute left-3.5 size-4 text-tm-text-3" aria-hidden />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder="Scan or search TM-number, name, store…"
            className="h-10 w-full rounded-full border border-tm-border bg-card pr-9 pl-10 text-[13.5px] font-medium text-tm-ink outline-none placeholder:text-tm-text-3 focus:border-tm-coral/60 focus:ring-4 focus:ring-tm-coral/10"
            aria-label="Search the bench"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
              className="absolute right-2.5 flex size-6 items-center justify-center rounded-full text-tm-text-3 hover:bg-tm-hairline hover:text-tm-ink"
              aria-label="Clear search"
            >
              <XIcon className="size-3.5" />
            </button>
          ) : null}
        </label>
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[22px] border border-dashed border-tm-border bg-card px-6 py-14 text-center">
          <InboxIcon className="size-8 text-tm-text-3" aria-hidden />
          <p className="font-display text-[17px] font-bold text-tm-ink">
            {query ? "Nothing matches that" : stage === "awaiting" ? "Nothing expected" : "Nothing here"}
          </p>
          <p className="max-w-[44ch] text-[13px] font-medium text-tm-text-2">
            {query
              ? "Try the TM-number on the parcel's paperwork, or the customer's name."
              : "Paid orders appear here as soon as the customer pays, so you can log them in the moment they arrive."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group, gi) => {
            const pickable = group.items.filter(selectable);
            const allOn = pickable.length > 0 && pickable.every((i) => selected.has(i.order_id));
            return (
              <section
                key={group.key}
                className="tm-up overflow-hidden rounded-[22px] border border-tm-border bg-card [animation-duration:0.45s]"
                style={{ animationDelay: `${Math.min(gi, 8) * 0.04}s` }}
              >
                <header className="flex items-center gap-3 border-b border-tm-hairline bg-tm-paper/50 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.items)}
                    disabled={pickable.length === 0}
                    aria-label={`Select all items for ${group.recipient.name ?? "this customer"}`}
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-[6px] border-2 transition-colors disabled:opacity-30",
                      allOn ? "border-tm-coral bg-tm-coral text-white" : "border-tm-border bg-card",
                    )}
                  >
                    {allOn ? <CheckIcon className="size-3.5 stroke-[3]" /> : null}
                  </button>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[14px] font-semibold text-tm-ink">{group.recipient.name ?? "Customer"}</span>
                    <span className="truncate text-[12px] font-medium text-tm-text-3">
                      {[recipientPlace(group.recipient), group.recipient.phone, pluralise(group.items.length, "item")]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  {pickable.length > 1 ? (
                    <PackItemsButton
                      orderIds={pickable.map((i) => i.order_id)}
                      label={`Pack all ${pickable.length}`}
                      variant="secondary"
                      className="hidden h-8 px-3.5 sm:inline-flex"
                    />
                  ) : null}
                </header>
                <ul className="divide-y divide-tm-hairline">
                  {group.items.map((item) => {
                    const canPick = selectable(item);
                    const on = selected.has(item.order_id);
                    return (
                      <li
                        key={item.order_id}
                        className={cn("flex items-center gap-3 px-4 py-3 transition-colors", on && "bg-tm-tint/50")}
                      >
                        <button
                          type="button"
                          onClick={() => canPick && toggle(item.order_id)}
                          disabled={!canPick}
                          aria-pressed={on}
                          aria-label={`Select ${item.order_no}`}
                          title={item.package ? `In ${item.package.reference}` : item.held ? "On hold" : undefined}
                          className={cn(
                            "flex size-5 shrink-0 items-center justify-center rounded-[6px] border-2 transition-colors disabled:opacity-30",
                            on ? "border-tm-coral bg-tm-coral text-white" : "border-tm-border bg-card",
                          )}
                        >
                          {on ? <CheckIcon className="size-3.5 stroke-[3]" /> : null}
                        </button>
                        <Link href={`/warehouse/items/${item.order_id}`} className="flex min-w-0 flex-1 items-center gap-3">
                          <ItemThumb item={item} size={54} />
                          <span className="flex min-w-0 flex-1 flex-col gap-1">
                            <span className="line-clamp-1 text-[14px] leading-tight font-semibold text-tm-ink">{item.title}</span>
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] font-medium text-tm-text-3">
                              <span className="font-mono text-tm-text-2">{item.order_no}</span>
                              {item.store ? <span>{item.store}</span> : null}
                              <span>Qty {item.quantity}</span>
                              {item.received ? (
                                <span className="text-tm-green-ink">
                                  Arrived {lowerFirst(formatRelative(item.received.at))}
                                  {item.received.weight_lbs ? ` · ${formatLbs(item.received.weight_lbs)}` : ""}
                                </span>
                              ) : item.listed_weight_lbs ? (
                                <span>~{formatLbs(item.listed_weight_lbs)}</span>
                              ) : null}
                              {item.package ? (
                                <span className="font-semibold text-tm-coral-strong">in {item.package.reference}</span>
                              ) : null}
                            </span>
                            <ItemFlags item={item} />
                          </span>
                        </Link>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="hidden sm:inline-flex">
                            <StageBadge stage={item.stage} />
                          </span>
                          {item.stage === "awaiting" ? (
                            <AdminButton variant="primary" className="h-8 px-3.5" onClick={() => setReceiving(item)}>
                              Log in
                            </AdminButton>
                          ) : item.stage === "received" ? (
                            <AdminButton
                              variant="quiet"
                              className="h-8 px-3"
                              onClick={() => setReceiving(item)}
                              aria-label={`Re-weigh ${item.order_no}`}
                              title={STAGE_META.received.hint}
                            >
                              <ScaleIcon className="size-4" />
                            </AdminButton>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {/* The selection tray */}
      <AnimatePresence>
        {selectedIds.length > 0 ? (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-3 bottom-[calc(84px_+_env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-[640px] items-center gap-3 rounded-[20px] bg-tm-ink p-2.5 pl-4 text-white shadow-[0_24px_50px_-20px_rgba(43,36,34,0.7)] md:bottom-6"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/12 text-[14px] font-bold">
              {selectedIds.length}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
              {selectedIds.length === 1 ? "item selected" : "items selected"}
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="ml-2 text-[12.5px] font-medium text-white/60 underline-offset-2 hover:text-white hover:underline"
              >
                Clear
              </button>
            </span>
            {openPackages.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  disabled={adding}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-white/20"
                >
                  <PackagePlusIcon className="size-4" aria-hidden />
                  <span className="hidden sm:inline">Add to open</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="top" className="w-64 rounded-[14px]">
                  <DropdownMenuLabel className="text-[12px] text-tm-text-3">Packages on the bench</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {openPackages.map((pkg) => (
                    <DropdownMenuItem key={pkg.id} onSelect={() => addToExisting(pkg)} className="flex flex-col items-start gap-0.5">
                      <span className="font-mono text-[13px] font-bold">{pkg.reference}</span>
                      <span className="text-[12px] text-tm-text-3">
                        {pluralise(pkg.unit_count, "item")}
                        {pkg.recipients.length ? ` · ${[...new Set(pkg.recipients)].join(", ")}` : ""}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <PackItemsButton orderIds={selectedIds} label="New package" />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {receiving ? (
        <ReceiveDialog item={receiving} open={!!receiving} onOpenChange={(o) => !o && setReceiving(null)} />
      ) : null}
    </div>
  );
}

/** "Just now" → "just now", "12 Sep" stays. For mid-sentence relative times. */
function lowerFirst(text: string): string {
  return /^[A-Z][a-z]/.test(text) ? text[0]!.toLowerCase() + text.slice(1) : text;
}
