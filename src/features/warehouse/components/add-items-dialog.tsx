"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CheckIcon, PenLineIcon, ScanLineIcon, SearchIcon } from "lucide-react";

import { AdminButton } from "@/components/layout/admin/controls";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";

import type { WarehouseItem, WarehousePackage } from "../types";
import { groupByRecipient, matchesQuery, pluralise, recipientPlace } from "./format";
import { errorText, warehouseRequest } from "./warehouse-actions";
import { ItemFlags, ItemThumb, StageBadge } from "./warehouse-ui";

/**
 * Put things in an open package (081): pick from the shelf, scan a TM-number,
 * or describe something that came in outside the order system.
 *
 * Items already belonging to the package's customer float to the top — mixing
 * two people's parcels into one box is allowed (a consolidated carton) but it
 * should be a choice, not an accident, so it is also flagged.
 */
export function AddItemsDialog({
  pkg,
  open,
  onOpenChange,
}: {
  pkg: WarehousePackage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"shelf" | "describe">("shelf");
  const [items, setItems] = useState<WarehouseItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPicked(new Set());
    setQuery("");
    setItems(null);
    warehouseRequest<WarehouseItem[]>("/api/warehouse/items", "GET")
      .then((all) => setItems(all.filter((i) => !i.package && (i.stage === "received" || i.stage === "awaiting"))))
      .catch((error) => {
        toast.error({ title: "Could not load the shelf", description: errorText(error) });
        setItems([]);
      });
  }, [open]);

  const packageCustomers = useMemo(
    () => new Set(pkg.lines.map((l) => l.item?.customer_key).filter(Boolean) as string[]),
    [pkg.lines],
  );

  const groups = useMemo(() => {
    const visible = (items ?? []).filter((i) => matchesQuery(i, query));
    const sorted = [...visible].sort((a, b) => {
      const aMine = packageCustomers.has(a.customer_key) ? 0 : 1;
      const bMine = packageCustomers.has(b.customer_key) ? 0 : 1;
      if (aMine !== bMine) return aMine - bMine;
      // On the shelf before expected: those are the ones physically in reach.
      return (a.stage === "received" ? 0 : 1) - (b.stage === "received" ? 0 : 1);
    });
    return groupByRecipient(sorted);
  }, [items, query, packageCustomers]);

  const toggle = (item: WarehouseItem) => {
    if (item.held) return;
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(item.order_id)) next.delete(item.order_id);
      else next.add(item.order_id);
      return next;
    });
  };

  const onScan = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || !items) return;
    const code = query.trim().toUpperCase();
    const hit = items.find((i) => i.order_no.toUpperCase() === code);
    if (hit) {
      event.preventDefault();
      if (hit.held) {
        toast.error({ title: `${hit.order_no} is on hold`, description: hit.held.reason });
      } else {
        setPicked((prev) => new Set(prev).add(hit.order_id));
        toast.success({ title: `${hit.order_no} added to the selection` });
      }
      setQuery("");
    }
  };

  const mixing = [...picked].some((id) => {
    const item = items?.find((i) => i.order_id === id);
    return item && packageCustomers.size > 0 && !packageCustomers.has(item.customer_key);
  });

  const submit = async () => {
    setBusy(true);
    try {
      const body =
        tab === "shelf"
          ? { order_ids: [...picked] }
          : { lines: [{ description: description.trim(), quantity: Number(quantity) || 1 }] };
      await warehouseRequest(`/api/warehouse/packages/${pkg.id}/items`, "POST", body);
      toast.success({
        title: `Added to ${pkg.reference}`,
        description: tab === "shelf" ? pluralise(picked.size, "item") + " packed." : description.trim(),
      });
      onOpenChange(false);
      setDescription("");
      setQuantity("1");
      router.refresh();
    } catch (error) {
      toast.error({ title: "Could not add to the package", description: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = tab === "shelf" ? picked.size > 0 : description.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[620px]">
        <DialogHeader className="border-b border-tm-hairline px-5 pt-5 pb-4">
          <DialogTitle className="font-display text-[20px] font-bold text-tm-ink">Add to {pkg.reference}</DialogTitle>
          <DialogDescription className="text-[13px] font-medium text-tm-text-2">
            Tick what goes in, or scan a TM-number and press Enter.
          </DialogDescription>
          <div className="mt-3 inline-flex w-fit rounded-full bg-tm-paper p-1">
            {(
              [
                { value: "shelf", label: "From the shelf", icon: ScanLineIcon },
                { value: "describe", label: "Describe an item", icon: PenLineIcon },
              ] as const
            ).map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTab(t.value)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-semibold transition-colors",
                  tab === t.value ? "bg-card text-tm-ink shadow-[0_1px_3px_rgba(43,36,34,.12)]" : "text-tm-text-2",
                )}
              >
                <t.icon className="size-3.5" aria-hidden />
                {t.label}
              </button>
            ))}
          </div>
        </DialogHeader>

        {tab === "shelf" ? (
          <>
            <div className="px-5 pt-4">
              <label className="relative flex items-center">
                <SearchIcon className="pointer-events-none absolute left-3.5 size-4 text-tm-text-3" aria-hidden />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onScan}
                  placeholder="Scan or search…"
                  className="h-10 w-full rounded-full border border-tm-border bg-card pr-4 pl-10 text-[13.5px] font-medium text-tm-ink outline-none placeholder:text-tm-text-3 focus:border-tm-coral/60 focus:ring-4 focus:ring-tm-coral/10"
                />
              </label>
            </div>
            <div className="min-h-[200px] flex-1 overflow-y-auto px-3 py-3">
              {items === null ? (
                <div className="flex flex-col gap-2 px-2">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 rounded-[14px]" />
                  ))}
                </div>
              ) : groups.length === 0 ? (
                <p className="px-4 py-10 text-center text-[13px] font-medium text-tm-text-3">
                  {query ? "Nothing on the shelf matches." : "The shelf is empty — everything is packed."}
                </p>
              ) : (
                groups.map((group) => (
                  <div key={group.key} className="mb-2">
                    <div className="flex items-center gap-2 px-2 pt-2 pb-1.5">
                      <span className="text-[12px] font-bold text-tm-text-2">{group.recipient.name ?? "Customer"}</span>
                      <span className="text-[12px] font-medium text-tm-text-3">{recipientPlace(group.recipient)}</span>
                      {packageCustomers.has(group.key) ? (
                        <span className="rounded-full bg-tm-green-bg px-2 py-0.5 text-[10.5px] font-bold text-tm-green-ink">
                          Same customer
                        </span>
                      ) : null}
                    </div>
                    {group.items.map((item) => {
                      const on = picked.has(item.order_id);
                      return (
                        <button
                          key={item.order_id}
                          type="button"
                          onClick={() => toggle(item)}
                          disabled={!!item.held}
                          aria-pressed={on}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-[14px] px-2 py-2 text-left transition-colors disabled:opacity-50",
                            on ? "bg-tm-tint" : "hover:bg-tm-paper",
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-5 shrink-0 items-center justify-center rounded-[6px] border-2 transition-colors",
                              on ? "border-tm-coral bg-tm-coral text-white" : "border-tm-border bg-card",
                            )}
                          >
                            {on ? <CheckIcon className="size-3.5 stroke-[3]" /> : null}
                          </span>
                          <ItemThumb item={item} size={44} rounded={11} />
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="line-clamp-1 text-[13.5px] font-semibold text-tm-ink">{item.title}</span>
                            <span className="text-[12px] font-medium text-tm-text-3">
                              <span className="font-mono text-tm-text-2">{item.order_no}</span> · Qty {item.quantity}
                            </span>
                            <ItemFlags item={item} />
                          </span>
                          <StageBadge stage={item.stage} />
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-4 px-5 py-5">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-tm-ink">What is it?</span>
              <input
                autoFocus
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={200}
                placeholder="e.g. Replacement charger for TM-00042"
                className="h-11 rounded-[12px] border border-tm-border bg-card px-3.5 text-[14px] font-medium text-tm-ink outline-none placeholder:text-tm-text-3 focus:border-tm-coral/60"
              />
            </label>
            <label className="flex w-32 flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-tm-ink">Quantity</span>
              <input
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value.replace(/\D/g, "").slice(0, 3))}
                className="h-11 rounded-[12px] border border-tm-border bg-card px-3.5 text-[14px] font-semibold text-tm-ink outline-none focus:border-tm-coral/60"
              />
            </label>
            <p className="text-[12px] font-medium text-tm-text-3">
              A described item is on the label and the manifest, but it is not linked to an order, so no customer is notified about it.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-tm-hairline bg-tm-paper/60 px-5 py-3.5">
          <span className={cn("text-[12.5px] font-medium", mixing ? "text-[#7a4a06]" : "text-tm-text-3")}>
            {tab === "shelf"
              ? mixing
                ? "Mixing customers: this becomes a consolidated carton."
                : picked.size
                  ? pluralise(picked.size, "item") + " selected"
                  : "Nothing selected"
              : ""}
          </span>
          <AdminButton variant="primary" busy={busy} disabled={!canSubmit} onClick={submit}>
            Add to package
          </AdminButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
