"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BellIcon, ExternalLinkIcon, PencilIcon, ShoppingCartIcon, Trash2Icon } from "lucide-react";

import { AdminButton } from "@/components/layout/admin/controls";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";

import { readTrackingEntries } from "../inbound/tracking-link";
import type { BoardItem, BoardTracking } from "../types";
import { pluralise, sanitiseDecimal } from "./format";
import { errorText, warehouseRequest } from "./warehouse-actions";
import { StoreLinkRow } from "./store-link-row";
import { ItemThumb } from "./warehouse-ui";

/**
 * The two sheets the board opens: "Mark purchased" (admins) and "Store
 * tracking" (staff). Nothing in either is required: a number that is not a
 * tracking number is left out and named, never a reason to refuse. A store
 * tracking page with no number in it (Amazon's Share tracking) is kept as a
 * link (141).
 */

const INPUT =
  "h-11 w-full rounded-[12px] border border-tm-border bg-card px-3 text-[14px] font-medium text-tm-ink outline-none placeholder:text-tm-text-3 focus:border-tm-coral/60 focus:ring-4 focus:ring-tm-coral/10";
const PURCHASE_BATCH = 20;

function ItemList({ items, trailing }: { items: BoardItem[]; trailing?: (item: BoardItem) => React.ReactNode }) {
  return (
    <ul className="flex max-h-[220px] flex-col divide-y divide-tm-hairline overflow-y-auto rounded-[16px] border border-tm-border">
      {items.map((item) => (
        <li key={item.order_id} className="flex items-center gap-3 px-3 py-2">
          <ItemThumb item={item} size={36} rounded={10} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-tm-ink">{item.title}</span>
            <span className="block font-mono text-[11.5px] font-semibold text-tm-text-3">{item.order_no}</span>
          </span>
          {trailing?.(item)}
        </li>
      ))}
    </ul>
  );
}

function ShareTick({ checked, onChange, orderNo }: { checked: boolean; onChange: (v: boolean) => void; orderNo: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-[14px] border border-tm-border bg-card px-3 py-2.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 accent-tm-coral" />
      <span className="text-[12.5px] leading-[1.45] font-medium text-tm-text-2">
        <span className="block text-[13px] font-semibold text-tm-ink">Show the store&apos;s tracking to the customer</span>
        Off: they see {orderNo} and Tomame&apos;s tracking page only.
      </span>
    </label>
  );
}

function TrackingField({ value, onChange, label, autoFocus }: { value: string; onChange: (v: string) => void; label: string; autoFocus?: boolean }) {
  const entries = useMemo(() => readTrackingEntries(value), [value]);
  const bad = entries.filter((e) => e.problem);
  const links = entries.filter((e) => !e.problem && !e.link && e.number !== e.input);
  const kept = entries.filter((e) => !e.problem && e.link);
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-tm-ink">{label}</span>
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="1Z999AA10123456784, TBA…, or the tracking link"
        autoCapitalize="characters"
        autoCorrect="off"
        className={cn(INPUT, bad.length > 0 && "border-tm-amber bg-tm-amber-bg")}
      />
      {bad.length > 0 ? (
        <span className="text-[12px] font-semibold text-[#7a4a06]">
          {bad.map((b) => `“${b.input.length > 40 ? `${b.input.slice(0, 40)}…` : b.input}”: ${b.problem}`).join(" ")}
          {" "}It will be left out; everything else still saves.
        </span>
      ) : links.length > 0 || kept.length > 0 ? (
        <span className="text-[12px] font-medium text-tm-green-ink">
          {links.length > 0 ? `Read from the link: ${links.map((l) => l.number).join(", ")}. ` : ""}
          {kept.length > 0 ? "Kept as the store's tracking page: staff can open it, the customer too if you tick below. Add the carrier's number later so the hub's scan finds it." : ""}
        </span>
      ) : (
        <span className="text-[12px] font-medium text-tm-text-3">Optional. Separate several with commas. A carrier link works too.</span>
      )}
    </label>
  );
}

// ── Mark purchased ──────────────────────────────────────────────────────────

export function PurchaseSheet({
  open,
  onOpenChange,
  items,
  sameCheckout,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: BoardItem[];
  /** Other unbought orders from the same checkouts: offered with one tick. */
  sameCheckout: BoardItem[];
  onDone?: () => void;
}) {
  const router = useRouter();
  const [tracking, setTracking] = useState("");
  const [storeRef, setStoreRef] = useState("");
  const [share, setShare] = useState(false);
  const [withRest, setWithRest] = useState(false);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setTracking("");
      setStoreRef("");
      setShare(false);
      setWithRest(false);
      setPrices({});
    }
  }, [open]);

  const all = withRest ? [...items, ...sameCheckout] : items;
  const first = all[0];
  if (!first) return null;

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const entries = readTrackingEntries(tracking);
    const good = entries.filter((e) => !e.problem).slice(0, 5);
    const leftOut = entries.filter((e) => e.problem).map((e) => e.input);
    const storePrices = Object.fromEntries(
      Object.entries(prices)
        .map(([id, v]) => [id, Number(v)] as const)
        .filter(([id, v]) => Number.isFinite(v) && v > 0 && all.some((i) => i.order_id === id)),
    );
    setBusy(true);
    const purchased: string[] = [];
    const refused: Array<{ order_id: string; reason: string }> = [];
    const serverNotes: string[] = [];
    try {
      for (let i = 0; i < all.length; i += PURCHASE_BATCH) {
        const ids = all.slice(i, i + PURCHASE_BATCH).map((o) => o.order_id);
        try {
          const res = await apiFetch<{ data: { purchased: string[]; refused: Array<{ order_id: string; reason: string }>; notes?: string[] } }>(
            "/api/admin/orders/purchase",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                order_ids: ids,
                ...(good.length > 0
                  ? {
                      store_tracking: good.map((g) => ({ tracking_number: g.link ?? g.number, store_order_ref: storeRef.trim() || null })),
                      share_store_tracking: share,
                    }
                  : {}),
                ...(Object.keys(storePrices).length ? { store_paid_prices: Object.fromEntries(ids.filter((id) => id in storePrices).map((id) => [id, storePrices[id]])) } : {}),
              }),
            },
          );
          purchased.push(...res.data.purchased);
          refused.push(...res.data.refused);
          for (const note of res.data.notes ?? []) if (!serverNotes.includes(note)) serverNotes.push(note);
        } catch (error) {
          refused.push(...ids.map((id) => ({ order_id: id, reason: errorText(error) })));
        }
      }
      const name = (id: string) => all.find((o) => o.order_id === id)?.order_no ?? "An order";
      const where = good.length ? "On its way to hub" : "Purchased · no tracking";
      const notes = [
        leftOut.length ? `Left out “${leftOut.join("”, “")}”: not a tracking number. Add it from the order.` : null,
        refused.length ? refused.map((r) => `${name(r.order_id)}: ${r.reason}`).join(" · ") : null,
        ...serverNotes,
      ].filter(Boolean);
      if (purchased.length) {
        const title = `${pluralise(purchased.length, "item")} marked purchased`;
        const description = [`Now ${where}. ${purchased.length > 1 ? "Customers were" : "The customer was"} told.`, ...notes].join(" ");
        if (notes.length) toast.error({ title, description });
        else toast.success({ title, description });
        onOpenChange(false);
        onDone?.();
        router.refresh();
      } else {
        toast.error({ title: "Nothing was marked purchased", description: notes.join(" ") || "Try again." });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[520px]">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="font-display text-[20px] font-bold text-tm-ink">
              Mark {pluralise(all.length, "item")} purchased
            </DialogTitle>
            <DialogDescription className="text-[13px] font-medium text-tm-text-2">
              Nothing here is required. Add the tracking now, later, or correct it after.
            </DialogDescription>
          </DialogHeader>

          <ItemList
            items={all}
            trailing={(item) => (
              <input
                inputMode="decimal"
                value={prices[item.order_id] ?? ""}
                onChange={(e) => setPrices((p) => ({ ...p, [item.order_id]: sanitiseDecimal(e.target.value) }))}
                placeholder="$ paid"
                aria-label={`What the store charged for ${item.order_no}, per item`}
                className="tm-nums h-9 w-[84px] rounded-[10px] border border-tm-border bg-card px-2 text-[13px] font-semibold text-tm-ink outline-none placeholder:text-tm-text-3 focus:border-tm-coral/60"
              />
            )}
          />

          {sameCheckout.length > 0 ? (
            <label className="flex cursor-pointer items-start gap-3 rounded-[14px] border border-tm-coral/30 bg-tm-tint/60 px-3 py-2.5">
              <input type="checkbox" checked={withRest} onChange={(e) => setWithRest(e.target.checked)} className="mt-0.5 size-4 accent-tm-coral" />
              <span className="text-[12.5px] leading-[1.45] font-medium text-tm-text-2">
                <span className="block text-[13px] font-semibold text-tm-ink">
                  Add the other {pluralise(sameCheckout.length, "item")} from this checkout
                </span>
                {sameCheckout.map((o) => o.order_no).join(", ")}, bought in the same store order.
              </span>
            </label>
          ) : null}

          <TrackingField value={tracking} onChange={setTracking} label="Store tracking · number or link" autoFocus />
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-tm-ink">
              Store order number <span className="font-medium text-tm-text-3">· optional, saved with the tracking</span>
            </span>
            <input value={storeRef} onChange={(e) => setStoreRef(e.target.value)} maxLength={80} placeholder="e.g. 112-4471239-0081234" className={INPUT} />
          </label>
          <ShareTick checked={share} onChange={setShare} orderNo={first.order_no} />
          <p className="rounded-[12px] bg-tm-paper px-3 py-2.5 text-[12px] leading-[1.45] font-medium text-tm-text-2">
            The <span className="font-semibold text-tm-ink">$ paid</span> boxes record what the store charged per item. Optional, admins only: hub staff never see prices.
          </p>

          <DialogFooter className="flex-row items-center justify-end gap-2">
            <AdminButton type="button" variant="quiet" onClick={() => onOpenChange(false)}>
              Cancel
            </AdminButton>
            <AdminButton type="submit" variant="primary" busy={busy}>
              <ShoppingCartIcon className="size-4" aria-hidden />
              Mark purchased
            </AdminButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Store tracking ──────────────────────────────────────────────────────────

export function TrackingSheet({
  open,
  onOpenChange,
  items,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: BoardItem[];
  onDone?: () => void;
}) {
  const router = useRouter();
  const [tracking, setTracking] = useState("");
  const [storeRef, setStoreRef] = useState("");
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [fixing, setFixing] = useState<BoardTracking | null>(null);

  useEffect(() => {
    if (open) {
      setTracking("");
      setStoreRef("");
      setShare(false);
      setFixing(null);
    }
  }, [open]);

  const one = items.length === 1 ? items[0]! : null;
  const existing = one?.tracking ?? [];
  const existingLink = one?.store_tracking_url ?? null;
  if (items.length === 0) return null;

  const done = () => {
    onDone?.();
    router.refresh();
  };

  const remove = async (t: BoardTracking) => {
    if (!one) return;
    setBusy(`rm:${t.parcel_id}`);
    try {
      await warehouseRequest(`/api/warehouse/inbound/${t.parcel_id}/links/${one.order_id}`, "DELETE");
      toast.success({ title: "Tracking removed", description: `${t.display} is no longer on ${one.order_no}.` });
      done();
    } catch (error) {
      toast.error({ title: "Could not remove it", description: errorText(error) });
    } finally {
      setBusy(null);
    }
  };

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const entries = readTrackingEntries(tracking);
    const good = entries.filter((e) => !e.problem);
    const bad = entries.filter((e) => e.problem);
    if (good.length === 0) {
      toast.error({ title: "Nothing to save", description: bad[0] ? `“${bad[0].input}”: ${bad[0].problem}` : "Enter a tracking number or link." });
      return;
    }
    setBusy("save");
    try {
      if (fixing && good[0]?.link) {
        toast.error({ title: "A link cannot replace a number", description: "Paste the carrier's number here, or add the link as new tracking." });
        return;
      }
      if (fixing && good[0]) {
        await warehouseRequest(`/api/warehouse/inbound/${fixing.parcel_id}`, "PATCH", { tracking_number: good[0].number });
        toast.success({ title: "Tracking corrected", description: "The customer is not messaged about a correction." });
      } else {
        const res = await warehouseRequest<{ added: string[]; refused: Array<{ order_no: string | null; input: string | null; reason: string }>; notified: number }>(
          "/api/warehouse/orders/tracking",
          "POST",
          {
            order_ids: items.map((i) => i.order_id),
            tracking_numbers: good.slice(0, 5).map((g) => g.link ?? g.number),
            ...(storeRef.trim() ? { store_order_ref: storeRef.trim() } : {}),
            share_store_tracking: share,
          },
        );
        const notes = [
          ...bad.map((b) => `Left out “${b.input}”: ${b.problem}`),
          ...res.refused.map((r) => [r.order_no, r.input ? `“${r.input}”` : null, r.reason].filter(Boolean).join(": ")),
        ];
        const description = [
          res.notified ? `${pluralise(res.notified, "customer")} told the store has shipped it.` : "No new message to the customer.",
          ...notes,
        ].join(" ");
        if (notes.length) toast.error({ title: `Tracking saved on ${pluralise(res.added.length, "order")}`, description });
        else toast.success({ title: `Tracking saved on ${pluralise(res.added.length, "order")}`, description });
      }
      onOpenChange(false);
      done();
    } catch (error) {
      toast.error({ title: "Could not save the tracking", description: errorText(error) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[500px]">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="font-display text-[20px] font-bold text-tm-ink">
              {fixing ? "Correct the tracking" : existing.length || existingLink ? "Store tracking" : "Add store tracking"}
            </DialogTitle>
            <DialogDescription className="text-[13px] font-medium text-tm-text-2">
              {one ? one.order_no : pluralise(items.length, "order")}. The hub&apos;s scan finds the order by this number when the parcel lands.
            </DialogDescription>
          </DialogHeader>

          {one ? null : <ItemList items={items} />}

          {existing.length > 0 && !fixing ? (
            <ul className="flex flex-col gap-2">
              {existing.map((t) => (
                <li key={t.parcel_id} className="flex items-center gap-2 rounded-[12px] border border-tm-hairline px-3 py-2">
                  <span className="text-[11px] font-bold tracking-wide text-tm-text-3 uppercase">{t.carrier_label}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-semibold text-tm-ink">{t.display}</span>
                  {t.url ? (
                    <a href={t.url} target="_blank" rel="noreferrer" className="flex size-8 items-center justify-center rounded-full text-tm-text-3 hover:bg-tm-paper hover:text-tm-ink" aria-label={`Track ${t.display} with the carrier`}>
                      <ExternalLinkIcon className="size-4" />
                    </a>
                  ) : null}
                  {t.status === "expected" ? (
                    <>
                      <button type="button" onClick={() => { setFixing(t); setTracking(t.display); }} className="flex size-8 items-center justify-center rounded-full text-tm-text-3 hover:bg-tm-paper hover:text-tm-ink" aria-label={`Correct ${t.display}`}>
                        <PencilIcon className="size-4" />
                      </button>
                      <button type="button" disabled={!!busy} onClick={() => remove(t)} className="flex size-8 items-center justify-center rounded-full text-tm-text-3 hover:bg-tm-pill-bg hover:text-tm-coral-strong" aria-label={`Remove ${t.display}`}>
                        <Trash2Icon className="size-4" />
                      </button>
                    </>
                  ) : (
                    <span className="text-[11.5px] font-semibold text-tm-green-ink">Arrived</span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          {one && existingLink && !fixing ? <StoreLinkRow orderId={one.order_id} url={existingLink} /> : null}

          <TrackingField
            value={tracking}
            onChange={setTracking}
            label={fixing ? `Correct ${fixing.display} to` : existing.length || existingLink ? "Add another number or link" : "Tracking number or link"}
            autoFocus
          />
          {fixing ? null : (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-tm-ink">
                  Store order number <span className="font-medium text-tm-text-3">· optional</span>
                </span>
                <input value={storeRef} onChange={(e) => setStoreRef(e.target.value)} maxLength={80} className={INPUT} />
              </label>
              <ShareTick checked={share} onChange={setShare} orderNo={items[0]!.order_no} />
              <p className="flex gap-2 rounded-[12px] bg-tm-paper px-3 py-2.5 text-[12px] leading-[1.45] font-medium text-tm-text-2">
                <BellIcon className="mt-0.5 size-3.5 shrink-0 text-tm-coral" aria-hidden />
                <span>
                  <span className="font-semibold text-tm-ink">The customer is told once</span>, the first time an order gets tracking. Corrections and extra numbers send nothing.
                </span>
              </p>
            </>
          )}

          <DialogFooter className="flex-row items-center justify-end gap-2">
            <AdminButton type="button" variant="quiet" onClick={() => (fixing ? setFixing(null) : onOpenChange(false))}>
              {fixing ? "Back" : "Cancel"}
            </AdminButton>
            <AdminButton type="submit" variant="primary" busy={busy === "save"}>
              {fixing ? "Save correction" : "Save tracking"}
            </AdminButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
