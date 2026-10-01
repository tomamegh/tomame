"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { InboxIcon, LinkIcon, PackageIcon, PlusIcon, ScaleIcon, SearchIcon, TruckIcon, UnlinkIcon } from "lucide-react";

import { AdminBadge, type AdminTone } from "@/components/layout/admin/admin-page";
import { AdminButton } from "@/components/layout/admin/controls";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";

import { inboundParcelPath, type InboundOrderRef, type InboundParcel, type InboundStatus } from "../types";
import { STAGE_META, formatDateTime, sanitiseDecimal } from "./format";
import { errorText, warehouseRequest } from "./warehouse-actions";

/**
 * Inbound parcels on screen (086): the store's tracking number, the orders it
 * belongs to, and the one tap that logs them in.
 */

export const INBOUND_META: Record<InboundStatus, { label: string; tone: AdminTone }> = {
  expected: { label: "Expected", tone: "muted" },
  arrived: { label: "Arrived", tone: "green" },
  unmatched: { label: "Unmatched", tone: "coral" },
};

export function InboundStatusBadge({ status }: { status: InboundStatus }) {
  const meta = INBOUND_META[status];
  return <AdminBadge tone={meta.tone}>{meta.label}</AdminBadge>;
}

function OrderThumb({ order, size = 44 }: { order: Pick<InboundOrderRef, "image_url">; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-tm-hairline bg-white"
      style={{ width: size, height: size }}
    >
      {order.image_url ? (
        <img src={order.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-contain p-1" />
      ) : (
        <PackageIcon className="size-1/2 text-tm-text-3" aria-hidden />
      )}
    </span>
  );
}

/** One order on a parcel: picture, TM-number, first name, where it is. */
export function InboundOrderLine({ order, trailing }: { order: InboundOrderRef; trailing?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <OrderThumb order={order} />
      <Link href={`/warehouse/items/${order.order_id}`} className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="line-clamp-1 text-[14px] font-semibold text-tm-ink">{order.title}</span>
        <span className="flex flex-wrap items-center gap-x-2 text-[12px] font-medium text-tm-text-3">
          <span className="font-mono font-bold text-tm-text-2">{order.order_no}</span>
          <span aria-hidden>·</span>
          <span>{order.first_name ?? "Customer"}</span>
          <span aria-hidden>·</span>
          <span>{STAGE_META[order.stage].label}</span>
          {order.held ? <span className="font-semibold text-tm-coral-strong">On hold</span> : null}
        </span>
      </Link>
      {trailing}
    </div>
  );
}

// ── The item page: tracking numbers on this order ───────────────────────────

/**
 * On `/warehouse/items/:id`. An admin pastes the store's tracking number here
 * after buying; the scan then finds this order when the box lands.
 */
export function OrderInboundPanel({
  orderId,
  orderNo,
  parcels,
  canAdd,
}: {
  orderId: string;
  orderNo: string;
  parcels: InboundParcel[];
  canAdd: boolean;
}) {
  const router = useRouter();
  const [tracking, setTracking] = useState("");
  const [storeRef, setStoreRef] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tracking.trim()) return;
    setBusy(true);
    try {
      const parcel = await warehouseRequest<InboundParcel>("/api/warehouse/inbound", "POST", {
        order_id: orderId,
        tracking_number: tracking,
        store_order_ref: storeRef.trim() || null,
      });
      toast.success({
        title: `${parcel.carrier_label} ${parcel.tracking_display} added`,
        description: `Scanning it at the hub now opens ${orderNo}.`,
      });
      setTracking("");
      setStoreRef("");
      router.refresh();
    } catch (error) {
      toast.error({ title: "Could not add it", description: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="tm-up flex flex-col gap-3 rounded-[22px] border border-tm-border bg-card p-5 [animation-duration:0.5s] [animation-delay:.06s]">
      <div className="flex items-center gap-2">
        <TruckIcon className="size-4 text-tm-text-3" aria-hidden />
        <h2 className="font-display text-[17px] leading-none font-bold text-tm-ink">Store tracking</h2>
      </div>
      {parcels.length === 0 ? (
        <p className="text-[13px] font-medium text-tm-text-3">
          No store tracking number yet. Add the one from the store&apos;s shipping email so the scan finds this order.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {parcels.map((p) => (
            <li key={p.id}>
              <Link
                href={inboundParcelPath(p.id)}
                className="flex min-w-0 items-center justify-between gap-2 rounded-[14px] bg-tm-paper px-3 py-2.5 hover:bg-tm-hairline"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-mono text-[13px] font-bold text-tm-ink">{p.tracking_display}</span>
                  <span className="text-[12px] font-medium text-tm-text-3">
                    {p.carrier_label}
                    {p.orders.length > 1 ? ` · ${p.orders.length} orders in this box` : ""}
                  </span>
                </span>
                <InboundStatusBadge status={p.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {canAdd ? (
        <form onSubmit={add} className="flex flex-col gap-2 border-t border-tm-hairline pt-3">
          <label htmlFor="inbound-tracking" className="text-[12.5px] font-semibold text-tm-ink">
            Add a tracking number
          </label>
          <input
            id="inbound-tracking"
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            maxLength={120}
            placeholder="1Z…, TBA…, 9400…"
            className="h-10 w-full rounded-[12px] border border-tm-border bg-card px-3 font-mono text-[13.5px] font-semibold text-tm-ink uppercase outline-none placeholder:font-sans placeholder:normal-case focus:border-tm-coral/60"
          />
          <input
            value={storeRef}
            onChange={(e) => setStoreRef(e.target.value)}
            maxLength={80}
            placeholder="Store order number (optional)"
            className="h-10 w-full rounded-[12px] border border-tm-border bg-card px-3 text-[13px] font-medium text-tm-ink outline-none placeholder:text-tm-text-3 focus:border-tm-coral/60"
          />
          <AdminButton type="submit" variant="secondary" busy={busy} disabled={!tracking.trim()} className="self-start">
            <PlusIcon className="size-4" aria-hidden />
            Add
          </AdminButton>
        </form>
      ) : null}
    </section>
  );
}

// ── Picking an order to link ────────────────────────────────────────────────

/** Search the bench by TM-number, product, store or first name. */
export function OrderPicker({
  candidates,
  exclude = [],
  busyId,
  onPick,
}: {
  candidates: InboundOrderRef[];
  exclude?: string[];
  busyId: string | null;
  onPick: (order: InboundOrderRef) => void;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = candidates.filter((c) => !exclude.includes(c.order_id));
    // Nothing typed: the orders still expected first, then what is on the shelf.
    if (!q) return [...pool].sort((a, b) => Number(b.stage === "awaiting") - Number(a.stage === "awaiting")).slice(0, 8);
    return pool
      .filter((c) =>
        [c.order_no, c.title, c.store, c.first_name].filter(Boolean).some((v) => v!.toLowerCase().includes(q)),
      )
      .slice(0, 12);
  }, [candidates, exclude, query]);

  return (
    <div className="flex flex-col gap-3">
      <label className="relative flex items-center">
        <SearchIcon className="pointer-events-none absolute left-3.5 size-4 text-tm-text-3" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="TM-number, product, store or first name"
          aria-label="Find the order"
          className="h-11 w-full rounded-[14px] border border-tm-border bg-card pr-3 pl-10 text-[14px] font-medium text-tm-ink outline-none placeholder:text-tm-text-3 focus:border-tm-coral/60"
        />
      </label>
      {results.length === 0 ? (
        <p className="text-[13px] font-medium text-tm-text-3">
          {query.trim() ? "No order on the bench matches." : "No orders are on the bench."}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-tm-hairline overflow-hidden rounded-[16px] border border-tm-border bg-card">
          {!query.trim() ? (
            <li className="px-4 py-2 text-[11.5px] font-semibold text-tm-text-3">On the bench, not yet logged in first</li>
          ) : null}
          {results.map((order) => (
            <li key={order.order_id} className="px-3 py-2.5">
              <InboundOrderLine
                order={order}
                trailing={
                  <AdminButton
                    variant="secondary"
                    busy={busyId === order.order_id}
                    disabled={busyId !== null}
                    onClick={() => onPick(order)}
                  >
                    <LinkIcon className="size-4" aria-hidden />
                    Link
                  </AdminButton>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── A scanned barcode nobody registered ─────────────────────────────────────

export function UnmatchedScan({
  code,
  display,
  carrierLabel,
  candidates,
}: {
  code: string;
  display: string;
  carrierLabel: string;
  candidates: InboundOrderRef[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const link = async (order: InboundOrderRef) => {
    setBusyId(order.order_id);
    try {
      const parcel = await warehouseRequest<InboundParcel>("/api/warehouse/inbound", "POST", {
        order_id: order.order_id,
        tracking_number: code,
      });
      toast.success({ title: `Linked to ${order.order_no}`, description: "Weigh it and log it in." });
      router.replace(`${inboundParcelPath(parcel.id)}?receive=1`);
    } catch (error) {
      toast.error({ title: "Could not link it", description: errorText(error) });
      setBusyId(null);
    }
  };

  const logUnmatched = async () => {
    setBusyId("unmatched");
    try {
      const parcel = await warehouseRequest<InboundParcel>("/api/warehouse/inbound/unmatched", "POST", {
        tracking_number: code,
        note: note.trim() || null,
      });
      toast.success({ title: "Logged as unmatched", description: "Shelve it apart. It is on the Inbound list until someone claims it." });
      router.replace(inboundParcelPath(parcel.id));
    } catch (error) {
      toast.error({ title: "Could not log it", description: errorText(error) });
      setBusyId(null);
    }
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="tm-up flex min-w-0 flex-col gap-4 rounded-[22px] border border-tm-border bg-card p-5 [animation-duration:0.5s]">
        <h2 className="font-display text-[17px] leading-none font-bold text-tm-ink">Which order is it?</h2>
        <p className="text-[13px] font-medium text-tm-text-2">
          Open the box if you need to. Find the order by its TM-number on the packing slip, or by what is inside.
        </p>
        <OrderPicker candidates={candidates} busyId={busyId} onPick={link} />
      </section>

      <aside className="tm-up flex flex-col gap-3 rounded-[22px] border border-tm-border bg-card p-5 [animation-duration:0.5s] [animation-delay:.06s]">
        <span className="text-[11px] font-bold tracking-[0.16em] text-tm-text-3 uppercase">{carrierLabel}</span>
        <span className="font-mono text-[18px] font-bold break-all text-tm-ink">{display}</span>
        <p className="text-[13px] font-medium text-tm-text-2">
          No order expects this parcel. If you cannot tell whose it is, log it so nobody loses it.
        </p>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          placeholder="What is it? (optional)"
          className="h-10 rounded-[12px] border border-tm-border bg-card px-3 text-[13px] font-medium text-tm-ink outline-none placeholder:text-tm-text-3 focus:border-tm-coral/60"
        />
        <AdminButton variant="danger" busy={busyId === "unmatched"} disabled={busyId !== null} onClick={logUnmatched}>
          <InboxIcon className="size-4" aria-hidden />
          Log as unmatched
        </AdminButton>
      </aside>
    </div>
  );
}

// ── A parcel ────────────────────────────────────────────────────────────────

export function InboundParcelActions({
  parcel,
  candidates,
  openReceive = false,
}: {
  parcel: InboundParcel;
  candidates: InboundOrderRef[];
  openReceive?: boolean;
}) {
  const router = useRouter();
  const [receiving, setReceiving] = useState(openReceive && parcel.orders.length > 0);
  const [linking, setLinking] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const pending = parcel.orders.filter((o) => o.stage === "awaiting");

  const unlink = async (order: InboundOrderRef) => {
    setBusyId(order.order_id);
    try {
      const res = await warehouseRequest<{ parcel: InboundParcel | null }>(
        `/api/warehouse/inbound/${parcel.id}/links/${order.order_id}`,
        "DELETE",
      );
      toast.success({ title: `${order.order_no} taken off this parcel` });
      if (res.parcel) router.refresh();
      else router.replace("/warehouse/inbound");
    } catch (error) {
      toast.error({ title: "Could not unlink it", description: errorText(error) });
    } finally {
      setBusyId(null);
    }
  };

  const link = async (order: InboundOrderRef) => {
    setBusyId(order.order_id);
    try {
      await warehouseRequest(`/api/warehouse/inbound/${parcel.id}/links`, "POST", { order_id: order.order_id });
      toast.success({ title: `${order.order_no} added to this parcel` });
      setLinking(false);
      router.refresh();
    } catch (error) {
      toast.error({ title: "Could not link it", description: errorText(error) });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="tm-up flex flex-col gap-3 rounded-[22px] border border-tm-border bg-card p-5 [animation-duration:0.5s]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-[17px] leading-none font-bold text-tm-ink">
            {parcel.orders.length === 0 ? "No order yet" : parcel.orders.length === 1 ? "The order inside" : `${parcel.orders.length} orders inside`}
          </h2>
          <div className="flex flex-wrap gap-2">
            {parcel.orders.length > 0 ? (
              <AdminButton variant="primary" className="h-10 px-5" onClick={() => setReceiving(true)}>
                <InboxIcon className="size-4" aria-hidden />
                {pending.length > 0 ? "Log it in" : "Log in again"}
              </AdminButton>
            ) : null}
            <AdminButton variant="secondary" className="h-10" onClick={() => setLinking((v) => !v)}>
              <LinkIcon className="size-4" aria-hidden />
              {parcel.orders.length === 0 ? "Link an order" : "Add an order"}
            </AdminButton>
          </div>
        </div>
        {parcel.orders.length === 0 ? (
          <p className="text-[13px] font-medium text-tm-text-3">
            Nobody has claimed this parcel. Link it to the order it belongs to once you know.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-tm-hairline">
            {parcel.orders.map((order) => (
              <li key={order.order_id} className="py-2.5">
                <InboundOrderLine
                  order={order}
                  trailing={
                    <AdminButton
                      variant="quiet"
                      aria-label={`Unlink ${order.order_no}`}
                      title="Wrong order? Unlink it"
                      busy={busyId === order.order_id}
                      disabled={busyId !== null}
                      onClick={() => unlink(order)}
                      className="px-3"
                    >
                      <UnlinkIcon className="size-4" aria-hidden />
                    </AdminButton>
                  }
                />
              </li>
            ))}
          </ul>
        )}
        {linking ? (
          <div className="border-t border-tm-hairline pt-3">
            <OrderPicker
              candidates={candidates}
              exclude={parcel.orders.map((o) => o.order_id)}
              busyId={busyId}
              onPick={link}
            />
          </div>
        ) : null}
      </section>

      <InboundReceiveDialog parcel={parcel} open={receiving} onOpenChange={setReceiving} />
    </div>
  );
}

function InboundReceiveDialog({
  parcel,
  open,
  onOpenChange,
}: {
  parcel: InboundParcel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [weight, setWeight] = useState("");
  const [busy, setBusy] = useState(false);
  const single = parcel.orders.length === 1;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = weight.trim() ? Number(weight) : null;
    if (parsed !== null && (!Number.isFinite(parsed) || parsed <= 0)) {
      toast.error({ title: "Check the weight", description: "Enter the scale reading in pounds, e.g. 1.4" });
      return;
    }
    setBusy(true);
    try {
      const res = await warehouseRequest<{ received: string[]; skipped: Array<{ order_no: string; reason: string }> }>(
        `/api/warehouse/inbound/${parcel.id}/receive`,
        "POST",
        { weight_lbs: single ? parsed : null, location: "US hub" },
      );
      if (res.received.length > 0) {
        toast.success({
          title: `${res.received.join(", ")} logged in`,
          description: "The customer's tracking now shows it at the hub.",
        });
      }
      if (res.skipped.length > 0) {
        toast.error({
          title: "Some orders were not logged in",
          description: res.skipped.map((s) => `${s.order_no}: ${s.reason}`).join(" · "),
        });
      }
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error({ title: "Could not log it in", description: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <form onSubmit={submit} className="flex min-w-0 flex-col gap-5">
          <DialogHeader>
            <DialogTitle className="font-display text-[20px] font-bold text-tm-ink">Log parcel in</DialogTitle>
            <DialogDescription className="text-[13px] font-medium text-tm-text-2">
              {single
                ? "Weigh it. The customer sees it arrive at the hub."
                : `This box holds ${parcel.orders.length} orders. Each is logged in; weigh them one by one from their own pages.`}
            </DialogDescription>
          </DialogHeader>
          <ul className="flex min-w-0 flex-col gap-2 rounded-[16px] bg-tm-paper p-3">
            {parcel.orders.map((o) => (
              <li key={o.order_id} className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-tm-text-2">
                <span className="shrink-0 font-mono font-bold whitespace-nowrap text-tm-ink">{o.order_no}</span>
                <span className="min-w-0 truncate">
                  {o.first_name ?? "Customer"} · {o.title}
                </span>
              </li>
            ))}
          </ul>
          {single ? (
            <label className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-tm-ink">Weight on the scale</span>
              <span className="relative flex items-center">
                <ScaleIcon className="pointer-events-none absolute left-4 size-5 text-tm-text-3" aria-hidden />
                <input
                  autoFocus
                  inputMode="decimal"
                  value={weight}
                  onChange={(e) => setWeight(sanitiseDecimal(e.target.value))}
                  placeholder="0.0"
                  className="tm-nums h-14 w-full rounded-[16px] border border-tm-border bg-card pr-14 pl-12 font-display text-[26px] font-bold text-tm-ink outline-none placeholder:text-tm-text-3/50 focus:border-tm-coral/60 focus:ring-4 focus:ring-tm-coral/10"
                />
                <span className="pointer-events-none absolute right-4 text-[15px] font-bold text-tm-text-3">lb</span>
              </span>
            </label>
          ) : null}
          <DialogFooter>
            <AdminButton type="submit" variant="primary" busy={busy}>
              Log it in
            </AdminButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** One row of the Inbound list. */
export function InboundRow({ parcel, late }: { parcel: InboundParcel; late: boolean }) {
  return (
    <Link
      href={inboundParcelPath(parcel.id)}
      className="flex min-w-0 flex-col gap-2 px-4 py-3 transition-colors hover:bg-tm-paper/70 sm:flex-row sm:items-center sm:gap-4"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-mono text-[14px] font-bold text-tm-ink">{parcel.tracking_display}</span>
        <span className="truncate text-[12px] font-medium text-tm-text-3">
          {parcel.carrier_label}
          {parcel.store_order_ref ? ` · store order ${parcel.store_order_ref}` : ""}
          {parcel.note ? ` · ${parcel.note}` : ""}
        </span>
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] font-medium text-tm-text-2 sm:w-[260px]">
        {parcel.orders.length === 0 ? (
          <span className="text-tm-text-3">No order</span>
        ) : (
          parcel.orders.map((o) => (
            <span key={o.order_id} className="whitespace-nowrap">
              <span className="font-mono font-bold text-tm-ink">{o.order_no}</span> {o.first_name ?? ""}
            </span>
          ))
        )}
      </span>
      <span className="flex items-center gap-2 sm:w-[170px] sm:justify-end">
        <span className={cn("text-[12px] font-semibold", late ? "text-tm-coral-strong" : "text-tm-text-3")}>
          {parcel.status === "expected"
            ? parcel.age_days === 0
              ? "Added today"
              : `${parcel.age_days} day${parcel.age_days === 1 ? "" : "s"} waiting`
            : parcel.arrived_at
              ? formatDateTime(parcel.arrived_at)
              : ""}
        </span>
        <InboundStatusBadge status={parcel.status} />
      </span>
    </Link>
  );
}
