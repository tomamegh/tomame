"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  BoxIcon,
  CheckIcon,
  ChevronRightIcon,
  LinkIcon,
  MessageSquareWarningIcon,
  PackagePlusIcon,
  PlaneLandingIcon,
  ScaleIcon,
  SearchIcon,
  ShoppingCartIcon,
  TriangleAlertIcon,
  TruckIcon,
  WarehouseIcon,
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
import type { MovableStage, ShipmentStageKey, StageSetting } from "@/features/shipments/stages";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";

import { ACTION_STAGES, BOARD_LEGS, BOARD_STAGE_META, BOARD_STAGES, countByStage, type BoardStage, type BoardTone } from "../board/stage";
import type { BoardItem, OrderBoard, WarehousePackage } from "../types";
import { PurchaseSheet, TrackingSheet } from "./board-sheets";
import { formatLbs, pluralise, recipientPlace, relativeInline } from "./format";
import { ReceiveDialog } from "./receive-dialog";
import { ShipmentUpdateDialog } from "./shipment-update-dialog";
import { errorText, warehouseRequest } from "./warehouse-actions";
import { ItemThumb } from "./warehouse-ui";

/**
 * The warehouse home: every order from paid to delivered, each in exactly one
 * stage (`boardStageOf`). Pick a stage on the strip, tick rows or whole groups,
 * and the bar offers that stage's action. A stage's count is the length of its
 * list: both come from the same array.
 *
 * Built for a phone held in one hand: the strip scrolls sideways, rows wrap
 * their button under the text, and the search box doubles as the scanner input.
 */

export type BoardGroup = "customer" | "checkout" | "none";

const TONE_PILL: Record<BoardTone, string> = {
  coral: "bg-tm-tint text-tm-coral-strong",
  amber: "bg-tm-amber-bg text-[#7a4a06]",
  blue: "bg-[#eef4fd] text-[#2f6fd0]",
  ink: "bg-[#f1ebe7] text-tm-ink",
  green: "bg-tm-green-bg text-tm-green-ink",
};

const STAGE_ICON: Record<BoardStage, typeof BoxIcon> = {
  to_buy: ShoppingCartIcon,
  purchased: LinkIcon,
  on_way: TruckIcon,
  at_hub: ScaleIcon,
  boxed: BoxIcon,
  in_flight: PlaneLandingIcon,
  in_accra: PlaneLandingIcon,
  out: TruckIcon,
  delivered: CheckIcon,
};

/** The step the shipments dialog suggests from each after-the-hub stage. */
const NEXT_MOVE: Partial<Record<BoardStage, MovableStage>> = {
  in_flight: "arrived_country",
  in_accra: "out_for_delivery",
  out: "delivered",
};

const EASE = [0.16, 1, 0.3, 1] as const;

function ageDays(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));
}

function shortDay(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Accra" });
}

function contextLine(item: BoardItem): string {
  switch (item.board_stage) {
    case "to_buy":
      return `Paid ${relativeInline(item.created_at)}`;
    case "purchased":
      return "No store tracking yet";
    case "on_way": {
      const [first, ...rest] = item.tracking;
      return first ? `${first.carrier_label} ${first.display}${rest.length ? ` +${rest.length}` : ""}` : "On its way";
    }
    case "at_hub":
      return `Arrived ${relativeInline(item.received?.at)} · ${item.received?.weight_lbs ? formatLbs(item.received.weight_lbs) : "not weighed"}`;
    case "boxed": {
      const day = shortDay(item.box?.departs_at ?? null);
      return `In ${item.package?.reference ?? "a box"} (${item.package?.status === "sealed" ? "sealed" : "packing"})${day ? ` · flies ${day}` : ""}`;
    }
    case "in_flight":
      return `${item.package?.reference ?? "Shipped"} · Delta Cargo to Accra`;
    case "in_accra":
      return `${item.package?.reference ?? ""} · landed in Accra`.replace(/^ · /, "");
    case "out":
      return "With a driver, or ready for pickup";
    case "delivered":
      return item.package?.reference ? `${item.package.reference} · delivered` : "Delivered";
  }
}

function matches(item: BoardItem, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase().replace(/\s+/g, "");
  return [item.order_no, item.title, item.store, item.recipient.name, item.recipient.phone, item.package?.reference, ...item.tracking.map((t) => t.display)]
    .filter(Boolean)
    .some((v) => v!.toLowerCase().replace(/\s+/g, "").includes(needle));
}

interface Group {
  key: string;
  title: string | null;
  sub: string | null;
  items: BoardItem[];
}

function groupItems(items: BoardItem[], by: BoardGroup): Group[] {
  if (by === "none") return [{ key: "all", title: null, sub: null, items }];
  const map = new Map<string, BoardItem[]>();
  for (const item of items) {
    const key = by === "customer" ? item.customer_key : item.checkout_key ?? `own:${item.order_id}`;
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  return [...map.entries()].map(([key, list]) => {
    const first = list[0]!;
    const place = recipientPlace(first.recipient);
    if (by === "customer") {
      return { key, title: first.recipient.name ?? "Customer", sub: [place, pluralise(list.length, "item")].filter(Boolean).join(" · "), items: list };
    }
    const day = new Date(list.reduce((min, i) => (i.created_at < min ? i.created_at : min), first.created_at)).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "Africa/Accra",
    });
    return {
      key,
      title: `${first.checkout_key ? "Checkout" : "Bought on its own"} of ${day} · ${first.recipient.name ?? "Customer"}`,
      sub: list.length > 1 ? `${pluralise(list.length, "item")} paid together. One store order usually covers them.` : place,
      items: list,
    };
  });
}

export function OrderBoardView({
  board,
  openBoxes,
  isAdmin,
  issues,
  settings,
  drivers,
  initialStage,
  initialGroup,
}: {
  board: OrderBoard;
  openBoxes: WarehousePackage[];
  isAdmin: boolean;
  issues: number;
  settings: Record<ShipmentStageKey, StageSetting>;
  drivers: Array<{ id: string; name: string; phone: string | null }>;
  initialStage: BoardStage | null;
  initialGroup: BoardGroup | null;
}) {
  const router = useRouter();
  const items = board.items;
  const counts = useMemo(() => countByStage(items), [items]);
  const [stage, setStage] = useState<BoardStage>(
    () => initialStage ?? BOARD_STAGES.find((s) => counts[s] > 0 && s !== "delivered") ?? "to_buy",
  );
  const [group, setGroup] = useState<BoardGroup>(initialGroup ?? "customer");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ kind: "purchase" | "tracking" | "move"; ids: string[] } | null>(null);
  const [receiving, setReceiving] = useState<BoardItem | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("stage", stage);
    url.searchParams.set("group", group);
    url.searchParams.delete("tab");
    window.history.replaceState(null, "", url);
  }, [stage, group]);

  // Keep the chosen stage in view on a phone's sideways strip. The strip
  // scrolls itself; scrollIntoView would drag the page along with it.
  useEffect(() => {
    const strip = stripRef.current;
    const button = strip?.querySelector<HTMLElement>(`[data-stage="${stage}"]`);
    if (!strip || !button || strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollTo({ left: button.offsetLeft - (strip.clientWidth - button.offsetWidth) / 2, behavior: "smooth" });
  }, [stage]);

  const searching = query.trim().length > 0;
  const visible = useMemo(
    () => (searching ? items.filter((i) => matches(i, query.trim())) : items.filter((i) => i.board_stage === stage)),
    [items, stage, query, searching],
  );
  const groups = useMemo(() => groupItems(visible, group), [visible, group]);
  const byId = useMemo(() => new Map(items.map((i) => [i.order_id, i])), [items]);
  const picked = [...selected].map((id) => byId.get(id)).filter((i): i is BoardItem => !!i);
  const pickedStages = [...new Set(picked.map((i) => i.board_stage))];
  const meta = BOARD_STAGE_META[stage];

  const pickStage = (next: BoardStage) => {
    setStage(next);
    setQuery("");
    setSelected(new Set());
  };

  const toggle = (item: BoardItem) => {
    if (item.held) {
      toast.error({ title: `${item.order_no} is on hold`, description: item.held.reason });
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.order_id)) next.delete(item.order_id);
      else next.add(item.order_id);
      return next;
    });
  };

  const toggleMany = (list: BoardItem[]) => {
    const ids = list.filter((i) => !i.held).map((i) => i.order_id);
    const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
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
    const hit = items.find(
      (i) => i.order_no.replace("-", "") === code.replace("-", "") || i.tracking.some((t) => t.display.replace(/\s+/g, "") === code),
    );
    if (hit) {
      setQuery("");
      setStage(hit.board_stage);
      setSelected(new Set([hit.order_id]));
      if (hit.board_stage === "on_way") setReceiving(hit);
      else toast.success({ title: `${hit.order_no} · ${BOARD_STAGE_META[hit.board_stage].label}`, description: "Selected. Scan the next one, or use the bar." });
      return;
    }
    // A box label, a carrier barcode nobody registered: the scan page knows.
    router.push(`/warehouse/p/${encodeURIComponent(query.trim())}`);
  };

  const done = () => setSelected(new Set());

  const receiveMany = async (list: BoardItem[]) => {
    setBusy("receive");
    try {
      const result = await warehouseRequest<{ received: number; failed: Array<{ order_no: string; reason: string }> }>(
        "/api/warehouse/items/receive",
        "POST",
        { order_ids: list.map((i) => i.order_id) },
      );
      const title = `${pluralise(result.received, "parcel")} logged in`;
      if (result.failed.length) toast.error({ title, description: result.failed.map((f) => `${f.order_no}: ${f.reason}`).join(" · ") });
      else toast.success({ title, description: "Now At the hub. Weigh them there, then pack." });
      done();
      router.refresh();
    } catch (error) {
      toast.error({ title: "Could not log them in", description: errorText(error) });
    } finally {
      setBusy(null);
    }
  };

  const pack = async (list: BoardItem[], box?: WarehousePackage) => {
    setBusy(box ? "add" : "pack");
    try {
      const ids = list.map((i) => i.order_id);
      const pkg = box
        ? (await warehouseRequest(`/api/warehouse/packages/${box.id}/items`, "POST", { order_ids: ids }), box)
        : await warehouseRequest<WarehousePackage>("/api/warehouse/packages", "POST", { order_ids: ids });
      toast.success({ title: box ? `Added to ${pkg.reference}` : `${pkg.reference} started`, description: "Weigh it, seal it, print the label, ship it." });
      router.push(`/warehouse/packages/${pkg.id}`);
      router.refresh();
    } catch (error) {
      toast.error({ title: box ? "Could not add them" : "Could not start the box", description: errorText(error) });
      setBusy(null);
    }
  };

  /** The row's one button: the next step for this stage. */
  const nextStep = (item: BoardItem) => {
    switch (item.board_stage) {
      case "to_buy":
        if (isAdmin) setSheet({ kind: "purchase", ids: [item.order_id] });
        return;
      case "purchased":
        setSheet({ kind: "tracking", ids: [item.order_id] });
        return;
      case "on_way":
        setReceiving(item);
        return;
      case "at_hub":
        void pack([item]);
        return;
      case "boxed":
        if (item.package) router.push(`/warehouse/packages/${item.package.id}`);
        return;
      case "in_flight":
      case "in_accra":
      case "out":
        setSheet({ kind: "move", ids: [item.order_id] });
        return;
      case "delivered":
        return;
    }
  };

  const sheetItems = sheet ? sheet.ids.map((id) => byId.get(id)).filter((i): i is BoardItem => !!i) : [];
  const sameCheckout =
    sheet?.kind === "purchase"
      ? items.filter(
          (i) =>
            i.board_stage === "to_buy" &&
            !sheet.ids.includes(i.order_id) &&
            !i.held &&
            sheetItems.some((s) => s.checkout_key && s.checkout_key === i.checkout_key),
        )
      : [];
  const moveStage = sheetItems[0] ? NEXT_MOVE[sheetItems[0].board_stage] ?? null : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Search + scanner, and the stage strip: stuck under the top bar on a phone. */}
      <div className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 -mx-4 flex flex-col gap-2.5 bg-tm-paper/95 px-4 pt-1 pb-2.5 backdrop-blur-md md:static md:mx-0 md:gap-3 md:bg-transparent md:p-0 md:backdrop-blur-none">
        <label className="relative flex items-center">
          <SearchIcon className="pointer-events-none absolute left-3.5 size-4 text-tm-text-3" aria-hidden />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
            enterKeyHint="search"
            autoCapitalize="characters"
            autoCorrect="off"
            placeholder="Scan or type TM-number, name, tracking, box…"
            className="h-11 w-full rounded-[14px] border border-tm-border bg-card pr-10 pl-10 text-[15px] font-medium text-tm-ink outline-none placeholder:text-tm-text-3 focus:border-tm-coral/60 focus:ring-4 focus:ring-tm-coral/10 md:text-[13.5px]"
            aria-label="Scan or search every order"
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

        <StageStrip counts={counts} stage={searching ? null : stage} onPick={pickStage} stripRef={stripRef} />
      </div>

      {board.truncated ? (
        <p className="rounded-[14px] bg-tm-amber-bg px-4 py-2.5 text-[12.5px] font-semibold text-[#7a4a06]">
          More orders are open than this screen reads at once. Search by TM number to find older ones.
        </p>
      ) : null}

      {issues > 0 ? (
        <Link href="/warehouse/issues" className="flex items-center gap-3 rounded-[16px] border border-[#f5d9b0] bg-tm-amber-bg px-4 py-3 hover:border-tm-amber/50">
          <MessageSquareWarningIcon className="size-5 shrink-0 text-tm-amber" aria-hidden />
          <span className="min-w-0 flex-1 text-[13px] font-semibold text-[#7a4a06]">{pluralise(issues, "customer issue")} open</span>
          <ChevronRightIcon className="size-4 shrink-0 text-tm-amber" aria-hidden />
        </Link>
      ) : null}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={searching ? "search" : stage}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.22, ease: EASE }}
          className="flex flex-col gap-3"
        >
          {searching ? (
            <p className="text-[13px] font-medium text-tm-text-2">
              {pluralise(visible.length, "order")} match{visible.length === 1 ? "es" : ""} across every stage. Press Enter on an exact TM or tracking number to jump to it.
            </p>
          ) : (
            <StageHint stage={stage} isAdmin={isAdmin} />
          )}

          {visible.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-[12px] font-semibold text-tm-text-3">Group by</span>
              <span className="inline-flex rounded-full border border-tm-border bg-card p-[3px]" role="group" aria-label="Group by">
                {(["customer", "checkout", "none"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGroup(g)}
                    aria-pressed={group === g}
                    className={cn(
                      "rounded-full px-3 py-1 text-[12px] font-semibold capitalize transition-colors",
                      group === g ? "bg-tm-ink text-white" : "text-tm-text-2 hover:text-tm-ink",
                    )}
                  >
                    {g}
                  </button>
                ))}
              </span>
              <button type="button" onClick={() => toggleMany(visible)} className="ml-auto text-[12.5px] font-semibold text-tm-coral-strong">
                {visible.filter((i) => !i.held).every((i) => selected.has(i.order_id)) ? "Clear" : `Select all ${visible.length}`}
              </button>
            </div>
          ) : null}

          {visible.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-tm-border bg-card px-6 py-12 text-center">
              <BoxIcon className="size-8 text-tm-text-3" aria-hidden />
              <p className="font-display text-[17px] font-bold text-tm-ink">{searching ? "Nothing matches that" : `Nothing ${meta.label.toLowerCase()}`}</p>
              <p className="max-w-[44ch] text-[13px] font-medium text-tm-text-2">
                {searching ? "Try the TM number, the customer's name or a tracking number." : "Orders show up here when they reach this stage."}
              </p>
            </div>
          ) : (
            groups.map((g) => (
              <GroupCard key={g.key} group={g} selected={selected} onToggle={toggle} onToggleGroup={toggleMany} onNext={nextStep} isAdmin={isAdmin} />
            ))
          )}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {picked.length > 0 ? (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.32, ease: EASE }}
            className="fixed inset-x-3 bottom-[calc(100px_+_env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-[720px] flex-wrap items-center gap-2 rounded-[20px] bg-tm-ink p-2 pl-2.5 text-white shadow-[0_24px_50px_-20px_rgba(43,36,34,0.7)] sm:flex-nowrap md:bottom-6"
          >
            <button type="button" onClick={done} aria-label="Clear selection" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/12 text-[14px] font-bold">
              {picked.length}
            </button>
            {pickedStages.length > 1 ? (
              <>
                <span className="min-w-0 flex-1 text-[12.5px] leading-tight font-semibold">
                  Across {pickedStages.length} stages
                  <span className="block font-medium text-white/60">Pick one to act on them together</span>
                </span>
                <span className="flex w-full gap-1.5 overflow-x-auto sm:w-auto">
                  {pickedStages.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setSelected(new Set(picked.filter((i) => i.board_stage === s).map((i) => i.order_id)));
                        setQuery("");
                        setStage(s);
                      }}
                      className="shrink-0 rounded-full border border-white/25 px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap"
                    >
                      {BOARD_STAGE_META[s].label} · {picked.filter((i) => i.board_stage === s).length}
                    </button>
                  ))}
                </span>
              </>
            ) : (
              <BulkActions
                stage={pickedStages[0]!}
                picked={picked}
                isAdmin={isAdmin}
                busy={busy}
                openBoxes={openBoxes}
                onPurchase={() => setSheet({ kind: "purchase", ids: picked.map((i) => i.order_id) })}
                onTracking={() => setSheet({ kind: "tracking", ids: picked.map((i) => i.order_id) })}
                onReceive={() => receiveMany(picked)}
                onPack={(box) => pack(picked, box)}
                onMove={() => setSheet({ kind: "move", ids: picked.map((i) => i.order_id) })}
              />
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <PurchaseSheet
        open={sheet?.kind === "purchase"}
        onOpenChange={(o) => !o && setSheet(null)}
        items={sheet?.kind === "purchase" ? sheetItems : []}
        sameCheckout={sameCheckout}
        onDone={done}
      />
      <TrackingSheet open={sheet?.kind === "tracking"} onOpenChange={(o) => !o && setSheet(null)} items={sheet?.kind === "tracking" ? sheetItems : []} onDone={done} />
      {sheet?.kind === "move" && sheetItems.length ? (
        <ShipmentUpdateDialog
          open
          onOpenChange={(o) => !o && setSheet(null)}
          mode="move"
          targets={{
            package_ids: [],
            order_ids: sheetItems.map((i) => i.order_id),
            summary: `${pluralise(sheetItems.length, "order")} · ${pluralise(new Set(sheetItems.map((i) => i.customer_key)).size, "customer")}`,
          }}
          settings={settings}
          suggestedStage={moveStage}
          drivers={drivers}
          onDone={() => {
            setSheet(null);
            done();
          }}
        />
      ) : null}
      {receiving ? <ReceiveDialog item={receiving} open onOpenChange={(o) => !o && setReceiving(null)} /> : null}
    </div>
  );
}

const LEG_ICON = { buy: ShoppingCartIcon, hub: WarehouseIcon, ghana: PlaneLandingIcon } as const;
const LEG_SURFACE = {
  buy: "border-[#f6d8cd] bg-[linear-gradient(180deg,#fff4ef_0%,#ffffff_70%)]",
  hub: "border-[#dde7f6] bg-[linear-gradient(180deg,#f3f7fd_0%,#ffffff_70%)]",
  ghana: "border-[#d6ebdd] bg-[linear-gradient(180deg,#f1f9f4_0%,#ffffff_70%)]",
} as const;
const LEG_INK = { buy: "text-tm-coral-strong", hub: "text-[#2f6fd0]", ghana: "text-tm-green-ink" } as const;

/**
 * The stage filter, as the journey it is: three legs (buy, the US hub, on to
 * the customer), each a card of stages joined by arrows. The active stage is a
 * filled tile that glides between positions; a coral dot marks a stage where
 * work is waiting on us. Every number is the length of the list it opens.
 */
function StageStrip({
  counts,
  stage,
  onPick,
  stripRef,
}: {
  counts: Record<BoardStage, number>;
  stage: BoardStage | null;
  onPick: (stage: BoardStage) => void;
  stripRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <LayoutGroup id="board-strip">
      <div
        ref={stripRef}
        role="group"
        aria-label="Filter by stage"
        className="relative -mx-4 flex snap-x scroll-px-4 gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0 lg:grid lg:grid-cols-[2fr_3fr_4fr] lg:overflow-visible lg:pb-0 [&::-webkit-scrollbar]:hidden"
      >
        {BOARD_LEGS.map((leg) => {
          const Icon = LEG_ICON[leg.key];
          const total = leg.stages.reduce((n, k) => n + counts[k], 0);
          return (
            <div key={leg.key} className={cn("flex shrink-0 snap-start flex-col gap-1 rounded-[20px] border p-1.5 lg:min-w-0 lg:shrink", LEG_SURFACE[leg.key])}>
              <div className="flex items-center gap-1.5 px-2 pt-1 text-[10.5px] font-bold tracking-[0.1em] text-tm-text-3 uppercase">
                <Icon className={cn("size-3.5", LEG_INK[leg.key])} aria-hidden />
                {leg.label}
                <span className="tm-nums ml-auto text-[11px] font-semibold tracking-normal normal-case">{pluralise(total, "order")}</span>
              </div>
              <div className="flex items-stretch">
                {leg.stages.map((key, i) => {
                  const active = stage === key;
                  const n = counts[key];
                  const waiting = n > 0 && ACTION_STAGES.includes(key);
                  return (
                    <Fragment key={key}>
                      {i > 0 ? <ChevronRightIcon className="size-3.5 shrink-0 self-center text-tm-text-3/40" aria-hidden /> : null}
                      <button
                        type="button"
                        data-stage={key}
                        onClick={() => onPick(key)}
                        aria-pressed={active}
                        aria-label={`${BOARD_STAGE_META[key].label}: ${n}`}
                        className={cn(
                          "group relative flex min-w-[96px] flex-1 flex-col gap-1.5 rounded-[14px] px-2.5 pt-2 pb-2.5 text-left transition-colors lg:min-w-0",
                          !active && "hover:bg-white",
                        )}
                      >
                        {active ? (
                          <motion.span
                            layoutId="board-stage-active"
                            className="absolute inset-0 rounded-[14px] bg-tm-ink shadow-[0_14px_30px_-16px_rgba(43,36,34,0.85)]"
                            transition={{ type: "spring", stiffness: 420, damping: 36 }}
                          />
                        ) : null}
                        <span className="relative flex items-center gap-1.5">
                          <motion.span
                            key={n}
                            initial={{ y: -6, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ duration: 0.3, ease: EASE }}
                            className={cn(
                              "tm-nums font-display text-[24px] leading-none font-bold",
                              active ? "text-white" : n === 0 ? "text-tm-text-3/45" : waiting ? "text-tm-coral-strong" : "text-tm-ink",
                            )}
                          >
                            {n}
                          </motion.span>
                          {waiting && !active ? (
                            <span className="relative flex size-2">
                              {key === "to_buy" ? <span className="absolute inline-flex size-full animate-ping rounded-full bg-tm-coral/50" /> : null}
                              <span className="relative inline-flex size-2 rounded-full bg-tm-coral" />
                            </span>
                          ) : null}
                        </span>
                        <span className={cn("relative text-[11.5px] leading-[1.2] font-semibold", active ? "text-white/85" : n === 0 ? "text-tm-text-3" : "text-tm-text-2")}>
                          {BOARD_STAGE_META[key].label}
                        </span>
                      </button>
                    </Fragment>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

function StageHint({ stage, isAdmin }: { stage: BoardStage; isAdmin: boolean }) {
  const meta = BOARD_STAGE_META[stage];
  const Icon = STAGE_ICON[stage];
  return (
    <div className="flex items-start gap-3 rounded-[16px] border border-tm-border bg-card px-4 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-tm-tint text-tm-coral-strong">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-tm-ink">
          {meta.label}
          {meta.next ? <span className="font-semibold text-tm-text-3"> → next: {meta.next}</span> : null}
        </span>
        <span className="mt-0.5 block max-w-[78ch] text-[13px] leading-[1.45] font-medium text-tm-text-2">{meta.hint}</span>
        {meta.who ? (
          <span className="mt-1 block text-[12px] font-semibold text-tm-text-3">
            {meta.who}
            {stage === "to_buy" && !isAdmin ? " You can see these; the buying happens on the admin side." : ""}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function GroupCard({
  group,
  selected,
  onToggle,
  onToggleGroup,
  onNext,
  isAdmin,
}: {
  group: Group;
  selected: Set<string>;
  onToggle: (item: BoardItem) => void;
  onToggleGroup: (items: BoardItem[]) => void;
  onNext: (item: BoardItem) => void;
  isAdmin: boolean;
}) {
  const pickable = group.items.filter((i) => !i.held);
  const allOn = pickable.length > 0 && pickable.every((i) => selected.has(i.order_id));
  return (
    <section className="overflow-hidden rounded-[18px] border border-tm-border bg-card">
      {group.title ? (
        <button
          type="button"
          onClick={() => onToggleGroup(group.items)}
          disabled={pickable.length === 0}
          className="flex min-h-12 w-full items-center gap-3 border-b border-tm-hairline bg-tm-paper/60 px-3 py-2 text-left disabled:opacity-60"
          aria-label={`Select all in ${group.title}`}
        >
          <Tick on={allOn} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold text-tm-ink">{group.title}</span>
            {group.sub ? <span className="block truncate text-[12px] font-medium text-tm-text-3">{group.sub}</span> : null}
          </span>
          {group.items.length > 1 ? <span className="shrink-0 text-[12px] font-semibold text-tm-coral-strong">{allOn ? "Clear" : "Select all"}</span> : null}
        </button>
      ) : null}
      <ul className="divide-y divide-tm-hairline">
        <AnimatePresence initial={false}>
          {group.items.map((item) => (
            <BoardRow key={item.order_id} item={item} on={selected.has(item.order_id)} onToggle={() => onToggle(item)} onNext={() => onNext(item)} isAdmin={isAdmin} />
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}

function BoardRow({
  item,
  on,
  onToggle,
  onNext,
  isAdmin,
}: {
  item: BoardItem;
  on: boolean;
  onToggle: () => void;
  onNext: () => void;
  isAdmin: boolean;
}) {
  const meta = BOARD_STAGE_META[item.board_stage];
  const Icon = STAGE_ICON[item.board_stage];
  const waiting = item.board_stage === "to_buy" ? ageDays(item.created_at) : 0;
  const label = item.board_stage === "boxed" && item.package ? `Open ${item.package.reference}` : meta.next;

  return (
    <motion.li
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25, ease: EASE }}
      className={cn("relative flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 pr-2 pl-3 transition-colors sm:flex-nowrap", on && "bg-tm-tint/60")}
    >
      <button type="button" onClick={onToggle} aria-pressed={on} aria-label={`Select ${item.order_no}`} className="flex min-w-0 flex-1 basis-[calc(100%-48px)] items-start gap-3 text-left sm:basis-auto sm:items-center">
        <Tick on={on} disabled={!!item.held} />
        <ItemThumb item={item} size={50} rounded={12} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="line-clamp-2 text-[14px] leading-tight font-semibold text-tm-ink">{item.title}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] font-medium text-tm-text-3">
            <span className="font-mono font-semibold text-tm-text-2">{item.order_no}</span>
            {item.store ? <span>{item.store}</span> : null}
            <span>Qty {item.quantity}</span>
            {!item.received && item.listed_weight_lbs ? <span>~{formatLbs(item.listed_weight_lbs)}</span> : null}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-semibold">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-bold whitespace-nowrap", TONE_PILL[meta.tone])}>
              <span className="size-1.5 rounded-full bg-current" aria-hidden />
              {meta.label}
            </span>
            <span className="min-w-0 font-medium break-all text-tm-text-2">{contextLine(item)}</span>
            {item.held ? <Flag>On hold</Flag> : null}
            {item.has_open_issue ? <Flag>Customer issue</Flag> : null}
            {waiting >= 2 ? <Flag>Waiting {waiting} days</Flag> : null}
          </span>
        </span>
      </button>
      <span className="ml-[34px] flex shrink-0 items-center gap-1 sm:ml-0">
        {label && !item.held ? (
          item.board_stage === "to_buy" && !isAdmin ? (
            <span className="inline-flex h-9 items-center rounded-full border border-dashed border-tm-border px-3 text-[12.5px] font-semibold text-tm-text-3">Waiting for a buyer</span>
          ) : (
            <AdminButton variant={item.board_stage === "to_buy" ? "primary" : "secondary"} className="h-9 px-3.5" onClick={onNext}>
              <Icon className="size-4" aria-hidden />
              {label}
            </AdminButton>
          )
        ) : null}
        <Link
          href={`/warehouse/items/${item.order_id}`}
          aria-label={`Open ${item.order_no}`}
          className="absolute right-2 flex size-10 items-center justify-center rounded-full text-tm-text-3 hover:bg-tm-paper hover:text-tm-ink sm:static"
        >
          <ChevronRightIcon className="size-5" aria-hidden />
        </Link>
      </span>
    </motion.li>
  );
}

function Flag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[6px] bg-tm-amber-bg px-1.5 py-px text-[11px] font-bold text-[#7a4a06]">
      <TriangleAlertIcon className="size-3" aria-hidden />
      {children}
    </span>
  );
}

function Tick({ on, disabled = false }: { on: boolean; disabled?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[7px] border-2 transition-colors sm:mt-0",
        on ? "border-tm-coral bg-tm-coral text-white" : "border-tm-border bg-card",
        disabled && "opacity-30",
      )}
    >
      <AnimatePresence>
        {on ? (
          <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ duration: 0.18 }}>
            <CheckIcon className="size-4 stroke-[3]" />
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}

function BulkActions({
  stage,
  picked,
  isAdmin,
  busy,
  openBoxes,
  onPurchase,
  onTracking,
  onReceive,
  onPack,
  onMove,
}: {
  stage: BoardStage;
  picked: BoardItem[];
  isAdmin: boolean;
  busy: string | null;
  openBoxes: WarehousePackage[];
  onPurchase: () => void;
  onTracking: () => void;
  onReceive: () => void;
  onPack: (box?: WarehousePackage) => void;
  onMove: () => void;
}) {
  const customers = new Set(picked.map((i) => i.customer_key)).size;
  const who = customers > 1 ? `${customers} customers` : picked[0]?.recipient.name ?? "One customer";
  const BAR_BTN = "h-10 border-white/15 bg-white/10 px-3.5 text-white hover:bg-white/20";
  return (
    <>
      <span className="min-w-0 flex-1 text-[12.5px] leading-tight font-semibold">
        <span className="block truncate">{BOARD_STAGE_META[stage].label}</span>
        <span className="block truncate font-medium text-white/60">
          {who}
          {stage === "at_hub" && customers > 1 ? " in one box" : ""}
        </span>
      </span>
      <span className="flex w-full justify-end gap-1.5 sm:w-auto">
        {stage === "to_buy" ? (
          isAdmin ? (
            <AdminButton variant="primary" className="h-10 flex-1 px-4 sm:flex-none" onClick={onPurchase}>
              <ShoppingCartIcon className="size-4" aria-hidden />
              Mark purchased
            </AdminButton>
          ) : (
            <span className="px-2 text-[12px] font-semibold text-white/60">Only admins mark purchased</span>
          )
        ) : null}
        {stage === "purchased" ? (
          <AdminButton variant="primary" className="h-10 flex-1 px-4 sm:flex-none" onClick={onTracking}>
            <LinkIcon className="size-4" aria-hidden />
            Add tracking
          </AdminButton>
        ) : null}
        {stage === "on_way" ? (
          <>
            <AdminButton variant="secondary" className={cn(BAR_BTN, "flex-1 sm:flex-none")} onClick={onTracking}>
              <LinkIcon className="size-4" aria-hidden />
              Tracking
            </AdminButton>
            <AdminButton variant="primary" className="h-10 flex-1 px-4 sm:flex-none" busy={busy === "receive"} onClick={onReceive}>
              <CheckIcon className="size-4" aria-hidden />
              Mark received
            </AdminButton>
          </>
        ) : null}
        {stage === "at_hub" ? (
          <>
            {openBoxes.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  disabled={!!busy}
                  aria-label="Add to an open box"
                  className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[13px] font-semibold text-white hover:bg-white/20"
                >
                  <PackagePlusIcon className="size-4" aria-hidden />
                  <span className="hidden sm:inline">Add to box</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="top" className="w-64 rounded-[14px]">
                  <DropdownMenuLabel className="text-[12px] text-tm-text-3">Boxes being packed</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {openBoxes.map((box) => (
                    <DropdownMenuItem key={box.id} onSelect={() => onPack(box)} className="flex flex-col items-start gap-0.5 py-2.5">
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
            <AdminButton variant="primary" className="h-10 flex-1 px-4 sm:flex-none" busy={busy === "pack"} onClick={() => onPack()}>
              <BoxIcon className="size-4" aria-hidden />
              Pack into one box
            </AdminButton>
          </>
        ) : null}
        {stage === "boxed" ? (
          <Link href="/warehouse/packages" className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-white/10 px-4 text-[13px] font-semibold hover:bg-white/20 sm:flex-none">
            <BoxIcon className="size-4" aria-hidden />
            Go to boxes
          </Link>
        ) : null}
        {stage === "in_flight" || stage === "in_accra" || stage === "out" ? (
          <AdminButton variant="primary" className="h-10 flex-1 px-4 sm:flex-none" onClick={onMove}>
            {stage === "in_flight" ? <PlaneLandingIcon className="size-4" aria-hidden /> : <TruckIcon className="size-4" aria-hidden />}
            {BOARD_STAGE_META[stage].next}
          </AdminButton>
        ) : null}
      </span>
    </>
  );
}
