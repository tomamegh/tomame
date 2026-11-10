"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRightIcon,
  BoxIcon,
  BoxesIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  InboxIcon,
  MessageSquareWarningIcon,
  PackageCheckIcon,
  PackagePlusIcon,
  PlaneLandingIcon,
  ScaleIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";

import { AdminButton } from "@/components/layout/admin/controls";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { journeyStageFor } from "@/features/orders/services/journey-stage";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";

import type { WarehouseItem, WarehousePackage } from "../types";
import { formatLbs, groupByRecipient, matchesQuery, pluralise, recipientPlace, relativeInline } from "./format";
import { NewPackageButton, errorText, warehouseRequest } from "./warehouse-actions";
import { PackageCard } from "./package-card";
import { ReceiveDialog } from "./receive-dialog";
import { ItemFlags, ItemThumb } from "./warehouse-ui";

/**
 * The warehouse home (098): the orders the hub has to act on, in the order the
 * work happens.
 *
 *   Expected → purchased orders on their way to us. Tick what came off the
 *              truck and "Mark received", or tap Receive to weigh one.
 *   At hub   → logged in, not in a box. Tick one customer's items, "Pack into
 *              one box". The box page weighs, seals, labels and ships it, and
 *              the customer gets ONE email listing what is inside.
 *   Boxes    → boxes on the bench (packing or sealed). Boxes only appear here,
 *              at packing time.
 *
 * ORDER STATUS IS NOT TRACKING. Each row shows the order's status ("Purchased",
 * the state machine) apart from where the parcel is ("At our US hub", the
 * tracking). Receiving changes tracking; packing a box and shipping it moves
 * the order status.
 *
 * Built for a phone held in one hand: tap anywhere on a row to select it, the
 * action bar sits above the thumb-reach tab bar, and the search box doubles as
 * the scanner input (a handheld scanner types the code and presses Enter).
 */

export type WorkbenchTab = "expected" | "hub" | "boxes";

const TABS: Array<{ key: WorkbenchTab; label: string; icon: typeof InboxIcon }> = [
  { key: "expected", label: "Expected", icon: InboxIcon },
  { key: "hub", label: "At hub", icon: PackageCheckIcon },
  { key: "boxes", label: "Boxes", icon: BoxesIcon },
];

export function OrdersWorkbench({
  items,
  boxes,
  initialTab,
  attention,
}: {
  /** Unpacked bench items: expected and received. */
  items: WarehouseItem[];
  /** Boxes on the bench: packing and sealed. */
  boxes: WarehousePackage[];
  initialTab: WorkbenchTab | null;
  attention: { issues: number; held: number };
}) {
  const router = useRouter();
  const expected = useMemo(() => items.filter((i) => i.stage === "awaiting"), [items]);
  const atHub = useMemo(() => items.filter((i) => i.stage === "received"), [items]);
  const [tab, setTab] = useState<WorkbenchTab>(
    initialTab ?? (expected.length > 0 ? "expected" : atHub.length > 0 ? "hub" : "boxes"),
  );
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [receiving, setReceiving] = useState<WarehouseItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showNotBought, setShowNotBought] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // The tab survives a refresh without a server round trip.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url);
  }, [tab]);

  const switchTab = (next: WorkbenchTab) => {
    setTab(next);
    setSelected(new Set());
  };

  const counts: Record<WorkbenchTab, number> = { expected: expected.length, hub: atHub.length, boxes: boxes.length };
  const source = tab === "expected" ? expected : tab === "hub" ? atHub : [];
  const visible = source.filter((i) => matchesQuery(i, query));
  // Purchased first: a paid order nobody has bought yet has no parcel coming.
  const bought = visible.filter((i) => !(i.stage === "awaiting" && i.order_status === "paid"));
  const notBought = visible.filter((i) => i.stage === "awaiting" && i.order_status === "paid");
  const groups = groupByRecipient(bought);
  const selectable = (i: WarehouseItem) => !i.held;
  const picked = source.filter((i) => selected.has(i.order_id));
  const customers = new Set(picked.map((i) => i.customer_key)).size;
  const openBoxes = boxes.filter((b) => b.status === "packing");

  const toggle = (item: WarehouseItem) => {
    if (!selectable(item)) {
      toast.error({ title: `${item.order_no} is on hold`, description: item.held?.reason ?? "Release it first." });
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.order_id)) next.delete(item.order_id);
      else next.add(item.order_id);
      return next;
    });
  };

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
    if (!code) return;
    event.preventDefault();
    const exact = items.find((i) => i.order_no.toUpperCase() === code || i.order_no.replace("-", "") === code);
    if (exact?.stage === "awaiting") {
      setTab("expected");
      setReceiving(exact);
    } else if (exact?.stage === "received") {
      setTab("hub");
      setSelected((prev) => new Set(prev).add(exact.order_id));
      toast.success({ title: `${exact.order_no} selected`, description: "Scan the next one, or pack them." });
    } else {
      // A box label, a carrier barcode, an order already packed: the scan page knows.
      router.push(`/warehouse/p/${encodeURIComponent(query.trim())}`);
    }
    setQuery("");
  };

  const receiveSelected = async () => {
    setBusy("receive");
    try {
      const result = await warehouseRequest<{ received: number; failed: Array<{ order_no: string; reason: string }> }>(
        "/api/warehouse/items/receive",
        "POST",
        { order_ids: picked.map((i) => i.order_id) },
      );
      const title = `${pluralise(result.received, "parcel")} logged in`;
      if (result.failed.length) {
        toast.error({ title, description: result.failed.map((f) => `${f.order_no}: ${f.reason}`).join(" · ") });
      } else {
        toast.success({ title, description: "They're on the At hub tab, ready to box. Weigh them from there." });
      }
      setSelected(new Set());
      router.refresh();
    } catch (error) {
      toast.error({ title: "Could not log them in", description: errorText(error) });
    } finally {
      setBusy(null);
    }
  };

  const packSelected = async () => {
    setBusy("pack");
    try {
      const pkg = await warehouseRequest<WarehousePackage>("/api/warehouse/packages", "POST", {
        order_ids: picked.map((i) => i.order_id),
      });
      toast.success({ title: `${pkg.reference} started`, description: "Weigh it, seal it, print the label, ship it." });
      router.push(`/warehouse/packages/${pkg.id}`);
      router.refresh();
    } catch (error) {
      toast.error({ title: "Could not start the box", description: errorText(error) });
      setBusy(null);
    }
  };

  const addToBox = async (box: WarehousePackage) => {
    setBusy("add");
    try {
      await warehouseRequest(`/api/warehouse/packages/${box.id}/items`, "POST", { order_ids: picked.map((i) => i.order_id) });
      toast.success({ title: `Added to ${box.reference}`, description: pluralise(picked.length, "item") + " packed." });
      router.push(`/warehouse/packages/${box.id}`);
      router.refresh();
    } catch (error) {
      toast.error({ title: "Could not add them", description: errorText(error) });
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Tabs: the three jobs, full width on a phone, stuck under the top bar. */}
      <div className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 -mx-4 bg-tm-paper/95 px-4 pt-1 pb-2 backdrop-blur-md md:static md:mx-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        <div role="tablist" aria-label="Warehouse work" className="grid grid-cols-3 gap-1 rounded-[16px] border border-tm-border bg-card p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => switchTab(t.key)}
              className={cn(
                "flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-[12px] px-2 text-[13.5px] font-semibold transition-colors md:h-11",
                tab === t.key ? "bg-tm-ink text-white shadow-sm" : "text-tm-text-2 hover:bg-tm-paper hover:text-tm-ink",
              )}
            >
              <t.icon className="hidden size-4 shrink-0 sm:block" aria-hidden />
              <span className="truncate">{t.label}</span>
              <span
                className={cn(
                  "tm-nums rounded-full px-1.5 py-0.5 text-[11.5px] leading-none font-bold",
                  tab === t.key ? "bg-white/20 text-white" : "bg-tm-paper text-tm-text-3",
                )}
              >
                {counts[t.key]}
              </span>
            </button>
          ))}
        </div>

        {tab !== "boxes" && (
          <label className="relative mt-2 flex items-center">
            <SearchIcon className="pointer-events-none absolute left-3.5 size-4 text-tm-text-3" aria-hidden />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKey}
              enterKeyHint="search"
              autoCapitalize="characters"
              autoCorrect="off"
              placeholder="Scan or type TM-number, name, store…"
              className="h-11 w-full rounded-[14px] border border-tm-border bg-card pr-10 pl-10 text-[15px] font-medium text-tm-ink outline-none placeholder:text-tm-text-3 focus:border-tm-coral/60 focus:ring-4 focus:ring-tm-coral/10 md:text-[13.5px]"
              aria-label="Scan or search orders"
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
                className="absolute right-1.5 flex size-8 items-center justify-center rounded-full text-tm-text-3 hover:bg-tm-hairline hover:text-tm-ink"
                aria-label="Clear search"
              >
                <XIcon className="size-4" />
              </button>
            ) : null}
          </label>
        )}
      </div>

      {(attention.issues > 0 || attention.held > 0) && (
        <Link
          href="/warehouse/issues"
          className="flex items-center gap-3 rounded-[16px] border border-[#f5d9b0] bg-tm-amber-bg px-4 py-3 hover:border-tm-amber/50"
        >
          <MessageSquareWarningIcon className="size-5 shrink-0 text-tm-amber" aria-hidden />
          <span className="min-w-0 flex-1 text-[13px] font-semibold text-[#7a4a06]">
            {[
              attention.issues ? pluralise(attention.issues, "customer issue") + " open" : null,
              attention.held ? pluralise(attention.held, "item") + " on hold" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <ChevronRightIcon className="size-4 shrink-0 text-tm-amber" aria-hidden />
        </Link>
      )}

      {tab === "boxes" ? (
        <BoxesTab boxes={boxes} />
      ) : (
        <>
          <p className="text-[13px] leading-[1.45] font-medium text-tm-text-2">
            {tab === "expected"
              ? "Purchased orders on their way to the hub. Tick what came off the truck and mark it received, or tap Receive to weigh one."
              : "Logged in at the hub. Tick one customer's items and pack them into one box. They get one email listing what's inside."}
          </p>

          {visible.length === 0 ? (
            <EmptyState tab={tab} searching={!!query} onBoxes={() => switchTab("boxes")} boxes={boxes.length} />
          ) : (
            <div className="flex flex-col gap-3">
              {groups.map((group) => (
                <CustomerGroup
                  key={group.key}
                  group={group}
                  selected={selected}
                  onToggle={toggle}
                  onToggleGroup={toggleGroup}
                  onReceive={setReceiving}
                  tab={tab}
                />
              ))}

              {notBought.length > 0 && (
                <section className="rounded-[18px] border border-dashed border-tm-border bg-card">
                  <button
                    type="button"
                    onClick={() => setShowNotBought((v) => !v)}
                    aria-expanded={showNotBought}
                    className="flex w-full items-center gap-2 px-4 py-3 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-semibold text-tm-ink">
                        Paid, not bought yet · {notBought.length}
                      </span>
                      <span className="block text-[12px] font-medium text-tm-text-3">
                        No store parcel is coming yet. Log one in only if it turns up anyway.
                      </span>
                    </span>
                    <ChevronDownIcon className={cn("size-4 text-tm-text-3 transition-transform", showNotBought && "rotate-180")} aria-hidden />
                  </button>
                  {showNotBought && (
                    <ul className="divide-y divide-tm-hairline border-t border-tm-hairline">
                      {notBought.map((item) => (
                        <ItemRow
                          key={item.order_id}
                          item={item}
                          on={selected.has(item.order_id)}
                          onToggle={() => toggle(item)}
                          onReceive={() => setReceiving(item)}
                          tab={tab}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </div>
          )}
        </>
      )}

      {/* The action bar: above the phone's tab bar, at the bottom on a desk. */}
      <AnimatePresence>
        {picked.length > 0 && tab !== "boxes" ? (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-3 bottom-[calc(100px_+_env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-[640px] items-center gap-2 rounded-[20px] bg-tm-ink p-2 pl-3 text-white shadow-[0_24px_50px_-20px_rgba(43,36,34,0.7)] md:bottom-6"
          >
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              aria-label="Clear selection"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/12 text-[14px] font-bold"
            >
              {picked.length}
            </button>
            <span className="min-w-0 flex-1 text-[12.5px] leading-tight font-semibold">
              <span className="block truncate">{picked.length === 1 ? "item" : "items"} selected</span>
              {tab === "hub" && customers > 1 ? (
                <span className="block truncate font-medium text-white/60">{customers} customers in one box</span>
              ) : null}
            </span>
            {tab === "expected" ? (
              <AdminButton variant="primary" className="h-11 px-4" busy={busy === "receive"} onClick={receiveSelected}>
                <CheckIcon className="size-4" aria-hidden />
                Mark received
              </AdminButton>
            ) : (
              <>
                {openBoxes.length > 0 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      disabled={!!busy}
                      aria-label="Add to an open box"
                      className="inline-flex h-11 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[13px] font-semibold text-white hover:bg-white/20"
                    >
                      <PackagePlusIcon className="size-4" aria-hidden />
                      <span className="hidden sm:inline">Add to box</span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" side="top" className="w-64 rounded-[14px]">
                      <DropdownMenuLabel className="text-[12px] text-tm-text-3">Open boxes</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {openBoxes.map((box) => (
                        <DropdownMenuItem key={box.id} onSelect={() => addToBox(box)} className="flex flex-col items-start gap-0.5 py-2.5">
                          <span className="font-mono text-[13px] font-bold">{box.reference}</span>
                          <span className="text-[12px] text-tm-text-3">
                            {pluralise(box.unit_count, "item")}
                            {box.recipients.length ? ` · ${box.recipients.map((r) => r.name ?? "Customer").join(", ")}` : ""}
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
                <AdminButton variant="primary" className="h-11 px-4" busy={busy === "pack"} onClick={packSelected}>
                  <BoxIcon className="size-4" aria-hidden />
                  Pack into one box
                </AdminButton>
              </>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {receiving ? (
        <ReceiveDialog item={receiving} open={!!receiving} onOpenChange={(o) => !o && setReceiving(null)} />
      ) : null}
    </div>
  );
}

function CustomerGroup({
  group,
  selected,
  onToggle,
  onToggleGroup,
  onReceive,
  tab,
}: {
  group: ReturnType<typeof groupByRecipient>[number];
  selected: Set<string>;
  onToggle: (item: WarehouseItem) => void;
  onToggleGroup: (items: WarehouseItem[]) => void;
  onReceive: (item: WarehouseItem) => void;
  tab: WorkbenchTab;
}) {
  const pickable = group.items.filter((i) => !i.held);
  const allOn = pickable.length > 0 && pickable.every((i) => selected.has(i.order_id));
  return (
    <section className="overflow-hidden rounded-[18px] border border-tm-border bg-card">
      <button
        type="button"
        onClick={() => onToggleGroup(group.items)}
        disabled={pickable.length === 0}
        className="flex min-h-12 w-full items-center gap-3 border-b border-tm-hairline bg-tm-paper/60 px-3 py-2 text-left disabled:opacity-60"
        aria-label={`Select all items for ${group.recipient.name ?? "this customer"}`}
      >
        <Tick on={allOn} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-tm-ink">{group.recipient.name ?? "Customer"}</span>
          <span className="block truncate text-[12px] font-medium text-tm-text-3">
            {[recipientPlace(group.recipient), pluralise(group.items.length, "item")].filter(Boolean).join(" · ")}
          </span>
        </span>
        {group.items.length > 1 ? (
          <span className="shrink-0 text-[12px] font-semibold text-tm-coral-strong">{allOn ? "Clear" : "Select all"}</span>
        ) : null}
      </button>
      <ul className="divide-y divide-tm-hairline">
        {group.items.map((item) => (
          <ItemRow
            key={item.order_id}
            item={item}
            on={selected.has(item.order_id)}
            onToggle={() => onToggle(item)}
            onReceive={() => onReceive(item)}
            tab={tab}
          />
        ))}
      </ul>
    </section>
  );
}

function ItemRow({
  item,
  on,
  onToggle,
  onReceive,
  tab,
}: {
  item: WarehouseItem;
  on: boolean;
  onToggle: () => void;
  onReceive: () => void;
  tab: WorkbenchTab;
}) {
  const status = journeyStageFor(item.order_status).label;
  const tracking = item.received
    ? `At our US hub · ${relativeInline(item.received.at)}${item.received.weight_lbs ? ` · ${formatLbs(item.received.weight_lbs)}` : " · not weighed"}`
    : item.order_status === "paid"
      ? "Not bought yet"
      : "On its way to the hub";

  return (
    <li className={cn("flex items-stretch transition-colors", on && "bg-tm-tint/60")}>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        aria-label={`Select ${item.order_no}`}
        className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-1 pl-3 text-left active:bg-tm-tint/40"
      >
        <Tick on={on} disabled={!!item.held} />
        <ItemThumb item={item} size={52} rounded={12} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="line-clamp-2 text-[14px] leading-tight font-semibold text-tm-ink">{item.title}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] font-medium text-tm-text-3">
            <span className="font-mono font-semibold text-tm-text-2">{item.order_no}</span>
            {item.store ? <span>{item.store}</span> : null}
            <span>Qty {item.quantity}</span>
            {!item.received && item.listed_weight_lbs ? <span>~{formatLbs(item.listed_weight_lbs)}</span> : null}
          </span>
          <span className="flex flex-wrap items-center gap-1.5 text-[11.5px] font-semibold">
            {/* Two different things, labelled so: the order's status, and where the parcel is. */}
            <span className="rounded-full bg-tm-paper px-2 py-0.5 text-tm-text-2">Order: {status}</span>
            <span className={cn(item.received ? "text-tm-green-ink" : "text-tm-text-3")}>{tracking}</span>
          </span>
          <ItemFlags item={item} />
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-1 pr-2">
        {tab === "expected" ? (
          <AdminButton variant="secondary" className="h-10 px-3.5" onClick={onReceive}>
            <ScaleIcon className="size-4" aria-hidden />
            <span className="hidden sm:inline">Receive</span>
          </AdminButton>
        ) : (
          <AdminButton variant="quiet" className="hidden h-10 w-10 px-0 sm:inline-flex" onClick={onReceive} aria-label={`Weigh ${item.order_no}`}>
            <ScaleIcon className="size-4" aria-hidden />
          </AdminButton>
        )}
        <Link
          href={`/warehouse/items/${item.order_id}`}
          aria-label={`Open ${item.order_no}`}
          className="flex size-10 items-center justify-center rounded-full text-tm-text-3 hover:bg-tm-paper hover:text-tm-ink"
        >
          <ChevronRightIcon className="size-5" aria-hidden />
        </Link>
      </div>
    </li>
  );
}

function Tick({ on, disabled = false }: { on: boolean; disabled?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-[7px] border-2 transition-colors",
        on ? "border-tm-coral bg-tm-coral text-white" : "border-tm-border bg-card",
        disabled && "opacity-30",
      )}
    >
      {on ? <CheckIcon className="size-4 stroke-[3]" /> : null}
    </span>
  );
}

function BoxesTab({ boxes }: { boxes: WarehousePackage[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-tm-text-2">
          Boxes on the bench. Open one to weigh it, seal it, print the label and ship it.
        </p>
        <div className="flex items-center gap-2">
          <Link
            href="/warehouse/shipments"
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-tm-border bg-card px-4 text-[13px] font-semibold text-tm-ink hover:bg-tm-paper"
          >
            <PlaneLandingIcon className="size-4" aria-hidden />
            Shipped
          </Link>
          <NewPackageButton />
        </div>
      </div>
      {boxes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-tm-border bg-card px-6 py-12 text-center">
          <BoxesIcon className="size-8 text-tm-text-3" aria-hidden />
          <p className="font-display text-[17px] font-bold text-tm-ink">No boxes on the bench</p>
          <p className="max-w-[44ch] text-[13px] font-medium text-tm-text-2">
            Tick items on the At hub tab and pack them into one box. It shows up here until it ships.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {boxes.map((box, i) => (
            <PackageCard key={box.id} pkg={box} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({
  tab,
  searching,
  onBoxes,
  boxes,
}: {
  tab: WorkbenchTab;
  searching: boolean;
  onBoxes: () => void;
  boxes: number;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-tm-border bg-card px-6 py-12 text-center">
      <InboxIcon className="size-8 text-tm-text-3" aria-hidden />
      <p className="font-display text-[17px] font-bold text-tm-ink">
        {searching ? "Nothing matches that" : tab === "expected" ? "Nothing expected" : "Nothing waiting to be boxed"}
      </p>
      <p className="max-w-[44ch] text-[13px] font-medium text-tm-text-2">
        {searching
          ? "Try the TM-number on the parcel's paperwork, or the customer's name."
          : tab === "expected"
            ? "Orders appear here once our buyers mark them purchased."
            : "Parcels you mark received land here, grouped by customer."}
      </p>
      {!searching && boxes > 0 ? (
        <button type="button" onClick={onBoxes} className="mt-1 inline-flex items-center gap-1 text-[13px] font-semibold text-tm-coral-strong">
          {pluralise(boxes, "box", "boxes")} on the bench <ArrowRightIcon className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
