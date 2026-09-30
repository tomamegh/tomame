"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowLeftIcon,
  CheckIcon,
  DropletsIcon,
  GlassWaterIcon,
  LockIcon,
  LockOpenIcon,
  MapPinIcon,
  PhoneIcon,
  PlaneTakeoffIcon,
  PlusIcon,
  PrinterIcon,
  ScanLineIcon,
  ShipIcon,
  Trash2Icon,
  TriangleAlertIcon,
  ArrowUpIcon,
  XIcon,
} from "lucide-react";

import { AdminButton, AdminConfirm } from "@/components/layout/admin/controls";
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

import type { WarehousePackage } from "../types";
import { AddItemsDialog } from "./add-items-dialog";
import {
  PACKAGE_META,
  formatDateTime,
  formatLbs,
  formatRelative,
  packageWeight,
  pluralise,
  recipientLines,
  sanitiseDecimal,
  sealBlocker,
} from "./format";
import { PackageBox } from "./package-box";
import { errorText, warehouseRequest } from "./warehouse-actions";
import { ItemLine, PackageStatusBadge } from "./warehouse-ui";

/**
 * One package, end to end (081).
 *
 * The page is arranged around the single next action, which changes with the
 * status and is always the biggest button: add items → seal → print the label →
 * ship. Everything else (details, recipients, history) sits beside it. The box
 * illustration follows the status live, so sealing one is seen: the flaps close
 * and the tape runs down the seam.
 */

type ShipResult = { package: WarehousePackage; failed: Array<{ order_no: string; reason: string }> };

export function PackageWorkbench({
  pkg,
  openAdd,
  scanned,
}: {
  pkg: WarehousePackage;
  openAdd: boolean;
  scanned: boolean;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [adding, setAdding] = useState(openAdd && pkg.status === "packing");
  const [shipping, setShipping] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const blocker = sealBlocker(pkg);
  const weight = packageWeight(pkg);

  // Arriving from a scan: say so once, so the operator knows it resolved.
  useEffect(() => {
    if (scanned) toast.success({ title: `${pkg.reference} scanned`, description: PACKAGE_META[pkg.status].verb });
  }, []);

  const act = async (action: "seal" | "reopen") => {
    setBusy(action);
    try {
      await warehouseRequest<ShipResult>(`/api/warehouse/packages/${pkg.id}/actions`, "POST", { action });
      toast.success({
        title: action === "seal" ? `${pkg.reference} sealed` : `${pkg.reference} reopened`,
        description: action === "seal" ? "Print the label and stick it on the top." : "Contents can change again. Reprint the label after.",
      });
      router.refresh();
    } catch (error) {
      toast.error({ title: action === "seal" ? "Could not seal it" : "Could not reopen it", description: errorText(error) });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (lineId: string) => {
    setRemoving(lineId);
    try {
      await warehouseRequest(`/api/warehouse/packages/${pkg.id}/items/${lineId}`, "DELETE");
      router.refresh();
    } catch (error) {
      toast.error({ title: "Could not remove it", description: errorText(error) });
    } finally {
      setRemoving(null);
    }
  };

  const destroy = async () => {
    setBusy("delete");
    try {
      await warehouseRequest(`/api/warehouse/packages/${pkg.id}`, "DELETE");
      toast.success({ title: `${pkg.reference} deleted`, description: "Its items are back on the shelf." });
      router.push("/warehouse/packages");
      router.refresh();
    } catch (error) {
      toast.error({ title: "Could not delete it", description: errorText(error) });
      setBusy(null);
    }
  };

  const steps = [
    { key: "packing", label: "Packed", at: pkg.created_at, by: pkg.created_by_name, done: true },
    { key: "sealed", label: "Sealed", at: pkg.sealed_at, by: pkg.sealed_by_name, done: pkg.status !== "packing" },
    { key: "shipped", label: "Shipped", at: pkg.shipped_at, by: pkg.shipped_by_name, done: pkg.status === "shipped" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/warehouse/packages"
        className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-tm-text-2 transition-colors hover:text-tm-ink"
      >
        <ArrowLeftIcon className="size-4" aria-hidden />
        Packages
      </Link>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* Hero */}
          <section className="tm-up relative overflow-hidden rounded-[26px] border border-tm-border bg-card [animation-duration:0.5s]">
            <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-6 p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:p-7">
              <div className="relative mx-auto flex h-[236px] w-[240px] items-end justify-center rounded-[22px] bg-[radial-gradient(110%_100%_at_50%_0%,#ffe4d9_0%,#fff1ec_40%,#fdf9f6_80%)] pb-5">
                <motion.div
                  key={pkg.status}
                  initial={reduce ? false : { scale: 0.94 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 18 }}
                >
                  <PackageBox status={pkg.status} reference={pkg.reference} size={172} />
                </motion.div>
              </div>

              <div className="flex min-w-0 flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <PackageStatusBadge status={pkg.status} />
                  {pkg.is_consolidated ? (
                    <span className="rounded-full bg-tm-ink px-2.5 py-1 text-[12px] leading-none font-semibold text-white">
                      Consolidated · {pluralise(pkg.recipients.length, "customer")}
                    </span>
                  ) : null}
                  {pkg.label_print_count > 0 ? (
                    <span className="rounded-full bg-tm-paper px-2.5 py-1 text-[12px] leading-none font-semibold text-tm-text-2">
                      Label printed ×{pkg.label_print_count}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1">
                  <h1 className="font-mono text-[34px] leading-none font-bold tracking-tight text-tm-ink sm:text-[40px]">
                    {pkg.reference}
                  </h1>
                  <p className="text-[13.5px] font-medium text-tm-text-2">
                    {pluralise(pkg.unit_count, "item")} · {formatLbs(weight.value)}
                    {weight.estimated ? " estimated" : ""} · {pkg.service === "air" ? "Air" : "Sea"} freight, {pkg.origin} → {pkg.destination}
                  </p>
                </div>

                {/* The next action */}
                <div className="flex flex-wrap items-center gap-2">
                  {pkg.status === "packing" ? (
                    <>
                      <AdminButton variant="secondary" onClick={() => setAdding(true)} className="h-10 px-4">
                        <PlusIcon className="size-4" aria-hidden />
                        Add items
                      </AdminButton>
                      <AdminButton
                        variant="primary"
                        className="h-10 px-5"
                        busy={busy === "seal"}
                        disabled={!!blocker}
                        onClick={() => act("seal")}
                        title={blocker ?? undefined}
                      >
                        <LockIcon className="size-4" aria-hidden />
                        Seal package
                      </AdminButton>
                    </>
                  ) : null}
                  {pkg.status !== "packing" ? (
                    <Link
                      href={`/warehouse/packages/${pkg.id}/label`}
                      className={cn(
                        "inline-flex h-10 items-center gap-1.5 rounded-full px-5 text-[13px] font-semibold",
                        pkg.status === "sealed" && pkg.label_print_count === 0
                          ? "tm-cta-gradient text-white shadow-[0_10px_24px_-14px_rgba(244,63,94,0.65)]"
                          : "border border-tm-border bg-card text-tm-ink hover:bg-tm-paper",
                      )}
                    >
                      <PrinterIcon className="size-4" aria-hidden />
                      {pkg.label_print_count ? "Reprint label" : "Print label"}
                    </Link>
                  ) : null}
                  {pkg.status === "sealed" ? (
                    <>
                      <AdminButton
                        variant={pkg.label_print_count > 0 ? "primary" : "secondary"}
                        className="h-10 px-5"
                        onClick={() => setShipping(true)}
                      >
                        <PlaneTakeoffIcon className="size-4" aria-hidden />
                        Mark shipped
                      </AdminButton>
                      <AdminButton variant="quiet" className="h-10" busy={busy === "reopen"} onClick={() => act("reopen")}>
                        <LockOpenIcon className="size-4" aria-hidden />
                        Reopen
                      </AdminButton>
                    </>
                  ) : null}
                </div>
                {blocker && pkg.status === "packing" ? (
                  <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-tm-text-3">
                    <TriangleAlertIcon className="size-3.5 text-tm-amber" aria-hidden />
                    {blocker}
                  </p>
                ) : null}
              </div>
            </div>

            {/* Progress */}
            <ol className="grid grid-cols-3 border-t border-tm-hairline bg-tm-paper/50">
              {steps.map((step, i) => (
                <li key={step.key} className={cn("flex items-start gap-2.5 px-4 py-3.5 sm:px-6", i > 0 && "border-l border-tm-hairline")}>
                  <span
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full transition-colors",
                      step.done ? "bg-tm-green text-white" : "border-2 border-tm-border bg-card",
                    )}
                  >
                    {step.done ? <CheckIcon className="size-3 stroke-[3]" /> : null}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className={cn("text-[13px] font-semibold", step.done ? "text-tm-ink" : "text-tm-text-3")}>{step.label}</span>
                    <span
                      className="truncate text-[11.5px] font-medium text-tm-text-3"
                      title={step.done && step.at ? formatDateTime(step.at) : undefined}
                    >
                      {step.done && step.at ? formatRelative(step.at) : "–"}
                    </span>
                    {step.done && step.by ? <span className="truncate text-[11.5px] font-medium text-tm-text-3">{step.by}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {/* Contents */}
          <section className="tm-up overflow-hidden rounded-[22px] border border-tm-border bg-card [animation-duration:0.5s] [animation-delay:.06s]">
            <header className="flex items-center justify-between gap-3 border-b border-tm-hairline px-5 py-4">
              <div className="flex flex-col gap-1">
                <h2 className="font-display text-[17px] leading-none font-bold text-tm-ink">Inside</h2>
                <p className="text-[12.5px] font-medium text-tm-text-2">
                  {pkg.line_count === 0
                    ? "Empty. Add items from the shelf or scan them in."
                    : `${pluralise(pkg.line_count, "line")}, ${pluralise(pkg.unit_count, "unit")}`}
                </p>
              </div>
              {pkg.status === "packing" ? (
                <AdminButton variant="secondary" onClick={() => setAdding(true)}>
                  <ScanLineIcon className="size-4" aria-hidden />
                  Add
                </AdminButton>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-tm-text-3">
                  <LockIcon className="size-3.5" aria-hidden />
                  {pkg.status === "sealed" ? "Reopen to change" : "Shipped"}
                </span>
              )}
            </header>
            {pkg.lines.length === 0 ? (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex w-full flex-col items-center gap-2 px-6 py-12 text-center transition-colors hover:bg-tm-paper/60"
              >
                <PackageBox status="packing" size={84} />
                <span className="mt-2 text-[14px] font-semibold text-tm-ink">Put the first item in</span>
              </button>
            ) : (
              <ul className="divide-y divide-tm-hairline">
                {pkg.lines.map((line, i) => (
                  <motion.li
                    key={line.id}
                    layout
                    initial={reduce ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: Math.min(i, 10) * 0.03 }}
                    className="px-4 py-3 sm:px-5"
                  >
                    {line.item ? (
                      <ItemLine
                        item={line.item}
                        quantity={line.quantity}
                        trailing={
                          pkg.status === "packing" ? (
                            <RemoveButton busy={removing === line.id} onClick={() => remove(line.id)} />
                          ) : null
                        }
                      />
                    ) : (
                      <div className="flex items-center gap-3">
                        <span className="flex size-[52px] shrink-0 items-center justify-center rounded-[14px] border border-dashed border-tm-border text-[11px] font-bold text-tm-text-3">
                          Note
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="text-[14px] font-semibold text-tm-ink">{line.description}</span>
                          <span className="text-[12px] font-medium text-tm-text-3">Described by hand · ×{line.quantity}</span>
                        </span>
                        {pkg.status === "packing" ? (
                          <RemoveButton busy={removing === line.id} onClick={() => remove(line.id)} />
                        ) : null}
                      </div>
                    )}
                  </motion.li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <PackageDetailsForm pkg={pkg} />
          <RecipientsCard pkg={pkg} />
          {pkg.status === "packing" ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex w-fit items-center gap-1.5 self-end text-[12.5px] font-semibold text-tm-text-3 transition-colors hover:text-tm-coral-strong"
            >
              <Trash2Icon className="size-3.5" aria-hidden />
              Delete this package
            </button>
          ) : null}
        </aside>
      </div>

      {adding ? <AddItemsDialog pkg={pkg} open={adding} onOpenChange={setAdding} /> : null}
      <ShipDialog pkg={pkg} open={shipping} onOpenChange={setShipping} />
      <AdminConfirm
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${pkg.reference}?`}
        consequence="The package is removed and every item in it goes back on the shelf. Any label already printed for it stops scanning."
        confirmLabel="Delete package"
        onConfirm={destroy}
        busy={busy === "delete"}
      />
    </div>
  );
}

function RemoveButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      disabled={busy}
      aria-label="Take out of the package"
      title="Take out"
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-tm-text-3 transition-colors hover:bg-tm-pill-bg hover:text-tm-coral-strong disabled:opacity-50"
    >
      <XIcon className="size-4" />
    </button>
  );
}

// ── Details ─────────────────────────────────────────────────────────────────

type DetailsDraft = {
  weight_lbs: string;
  length_in: string;
  width_in: string;
  height_in: string;
  service: "air" | "sea";
  origin: string;
  destination: string;
  carrier: string;
  tracking_number: string;
  fragile: boolean;
  this_way_up: boolean;
  keep_dry: boolean;
  notes: string;
};

function draftOf(pkg: WarehousePackage): DetailsDraft {
  const s = (n: number | null) => (n === null ? "" : String(n));
  return {
    weight_lbs: s(pkg.weight_lbs),
    length_in: s(pkg.length_in),
    width_in: s(pkg.width_in),
    height_in: s(pkg.height_in),
    service: pkg.service,
    origin: pkg.origin,
    destination: pkg.destination,
    carrier: pkg.carrier ?? "",
    tracking_number: pkg.tracking_number ?? "",
    fragile: pkg.fragile,
    this_way_up: pkg.this_way_up,
    keep_dry: pkg.keep_dry,
    notes: pkg.notes ?? "",
  };
}

function PackageDetailsForm({ pkg }: { pkg: WarehousePackage }) {
  const router = useRouter();
  const [draft, setDraft] = useState<DetailsDraft>(() => draftOf(pkg));
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(draftOf(pkg)), [pkg]);

  const original = draftOf(pkg);
  const dirty = (Object.keys(draft) as Array<keyof DetailsDraft>).filter((k) => draft[k] !== original[k]);
  const shipped = pkg.status === "shipped";
  const lockedForShipped = (key: keyof DetailsDraft) => shipped && !["carrier", "tracking_number", "notes"].includes(key);
  const set = <K extends keyof DetailsDraft>(key: K, value: DetailsDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      for (const key of dirty) {
        const value = draft[key];
        body[key] = ["weight_lbs", "length_in", "width_in", "height_in"].includes(key)
          ? num(value as string)
          : typeof value === "string"
            ? value.trim() || null
            : value;
      }
      await warehouseRequest(`/api/warehouse/packages/${pkg.id}`, "PATCH", body);
      toast.success({ title: "Saved", description: pkg.status === "sealed" && pkg.label_print_count > 0 ? "Reprint the label so it matches." : undefined });
      router.refresh();
    } catch (error) {
      toast.error({ title: "Could not save", description: errorText(error) });
    } finally {
      setSaving(false);
    }
  };

  const numberField = (key: "weight_lbs" | "length_in" | "width_in" | "height_in", placeholder: string) => (
    <input
      inputMode="decimal"
      value={draft[key]}
      disabled={lockedForShipped(key)}
      onChange={(e) => set(key, sanitiseDecimal(e.target.value))}
      placeholder={placeholder}
      className="tm-nums h-10 w-full min-w-0 rounded-[12px] border border-tm-border bg-card px-3 text-[14px] font-semibold text-tm-ink outline-none placeholder:font-medium placeholder:text-tm-text-3 focus:border-tm-coral/60 disabled:bg-tm-paper disabled:text-tm-text-3"
    />
  );

  const textInput = (key: "origin" | "destination" | "carrier" | "tracking_number", placeholder?: string) => (
    <input
      value={draft[key]}
      disabled={lockedForShipped(key)}
      onChange={(e) => set(key, e.target.value)}
      maxLength={80}
      placeholder={placeholder}
      className="h-10 w-full min-w-0 rounded-[12px] border border-tm-border bg-card px-3 text-[13.5px] font-medium text-tm-ink outline-none placeholder:text-tm-text-3 focus:border-tm-coral/60 disabled:bg-tm-paper disabled:text-tm-text-3"
    />
  );

  const handling = [
    { key: "fragile" as const, label: "Fragile", icon: GlassWaterIcon },
    { key: "this_way_up" as const, label: "This way up", icon: ArrowUpIcon },
    { key: "keep_dry" as const, label: "Keep dry", icon: DropletsIcon },
  ];

  return (
    <section className="tm-up flex flex-col gap-4 rounded-[22px] border border-tm-border bg-card p-5 [animation-duration:0.5s] [animation-delay:.08s]">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[17px] leading-none font-bold text-tm-ink">Details</h2>
        {dirty.length ? <span className="text-[12px] font-semibold text-tm-amber">Unsaved</span> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold text-tm-ink">Weight (lb)</span>
        <div className="flex items-center gap-2">
          {numberField("weight_lbs", pkg.estimated_weight_lbs ? `~${pkg.estimated_weight_lbs}` : "0.0")}
          {!draft.weight_lbs && pkg.estimated_weight_lbs && !shipped ? (
            <button
              type="button"
              onClick={() => set("weight_lbs", String(pkg.estimated_weight_lbs))}
              className="h-10 shrink-0 rounded-[12px] bg-tm-paper px-3 text-[12px] font-semibold text-tm-text-2 hover:text-tm-ink"
            >
              Use estimate
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold text-tm-ink">Size (in): L × W × H</span>
        <div className="grid grid-cols-3 gap-2">
          {numberField("length_in", "L")}
          {numberField("width_in", "W")}
          {numberField("height_in", "H")}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold text-tm-ink">Service</span>
        <div className="grid grid-cols-2 gap-1 rounded-[14px] bg-tm-paper p-1">
          {(["air", "sea"] as const).map((service) => (
            <button
              key={service}
              type="button"
              disabled={shipped}
              onClick={() => set("service", service)}
              className={cn(
                "inline-flex h-9 items-center justify-center gap-1.5 rounded-[11px] text-[13px] font-semibold transition-colors disabled:opacity-60",
                draft.service === service ? "bg-card text-tm-ink shadow-[0_1px_3px_rgba(43,36,34,.12)]" : "text-tm-text-2",
              )}
            >
              {service === "air" ? <PlaneTakeoffIcon className="size-4" /> : <ShipIcon className="size-4" />}
              {service === "air" ? "Air" : "Sea"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold text-tm-ink">From</span>
          {textInput("origin")}
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold text-tm-ink">To</span>
          {textInput("destination")}
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold text-tm-ink">Carrier</span>
          {textInput("carrier", "e.g. DHL")}
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold text-tm-ink">Waybill / tracking</span>
          {textInput("tracking_number", "Optional")}
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold text-tm-ink">Handling marks on the label</span>
        <div className="flex flex-wrap gap-2">
          {handling.map((h) => {
            const on = draft[h.key];
            return (
              <button
                key={h.key}
                type="button"
                disabled={shipped}
                aria-pressed={on}
                onClick={() => set(h.key, !on)}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold transition-colors disabled:opacity-60",
                  on ? "border-tm-ink bg-tm-ink text-white" : "border-tm-border bg-card text-tm-text-2 hover:text-tm-ink",
                )}
              >
                <h.icon className="size-3.5" aria-hidden />
                {h.label}
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold text-tm-ink">Notes for the team</span>
        <textarea
          value={draft.notes}
          onChange={(e) => set("notes", e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="Not printed on the label."
          className="resize-none rounded-[12px] border border-tm-border bg-card px-3 py-2.5 text-[13.5px] font-medium text-tm-ink outline-none placeholder:text-tm-text-3 focus:border-tm-coral/60"
        />
      </label>

      <div className="flex items-center justify-end gap-2">
        {dirty.length ? (
          <AdminButton variant="quiet" onClick={() => setDraft(original)} disabled={saving}>
            Discard
          </AdminButton>
        ) : null}
        <AdminButton variant="primary" busy={saving} disabled={dirty.length === 0} onClick={save}>
          Save details
        </AdminButton>
      </div>
    </section>
  );
}

function RecipientsCard({ pkg }: { pkg: WarehousePackage }) {
  if (pkg.recipients.length === 0) return null;
  return (
    <section className="tm-up flex flex-col gap-4 rounded-[22px] border border-tm-border bg-card p-5 [animation-duration:0.5s] [animation-delay:.1s]">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[17px] leading-none font-bold text-tm-ink">
          {pkg.is_consolidated ? "Customers inside" : "Deliver to"}
        </h2>
        {pkg.is_consolidated ? (
          <p className="text-[12.5px] font-medium text-tm-text-2">
            A consolidated carton. It is broken down on landing and each parcel goes on to its own door.
          </p>
        ) : null}
      </div>
      <ul className="flex flex-col gap-3">
        {pkg.recipients.map((r, i) => (
          <li key={`${r.name}-${i}`} className="flex flex-col gap-1 rounded-[16px] bg-tm-paper p-3.5">
            <span className="text-[14px] font-semibold text-tm-ink">{r.name ?? "Customer"}</span>
            {recipientLines(r).map((line) => (
              <span key={line} className="flex items-start gap-1.5 text-[12.5px] font-medium text-tm-text-2">
                <MapPinIcon className="mt-0.5 size-3.5 shrink-0 text-tm-text-3" aria-hidden />
                {line}
              </span>
            ))}
            {r.phone ? (
              <a href={`tel:${r.phone}`} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-tm-coral-strong">
                <PhoneIcon className="size-3.5" aria-hidden />
                {r.phone}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
      {pkg.box ? (
        <p className="text-[12px] font-medium text-tm-text-3">
          Freight box {pkg.box.label ?? ""}
          {pkg.box.departs_at ? ` · departs ${formatDateTime(pkg.box.departs_at)}` : ""}
        </p>
      ) : null}
    </section>
  );
}

// ── Ship ────────────────────────────────────────────────────────────────────

function ShipDialog({
  pkg,
  open,
  onOpenChange,
}: {
  pkg: WarehousePackage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [carrier, setCarrier] = useState(pkg.carrier ?? "");
  const [tracking, setTracking] = useState(pkg.tracking_number ?? "");
  const [busy, setBusy] = useState(false);
  const orders = pkg.lines.filter((l) => l.item).length;

  useEffect(() => {
    if (open) {
      setCarrier(pkg.carrier ?? "");
      setTracking(pkg.tracking_number ?? "");
    }
  }, [open, pkg.carrier, pkg.tracking_number]);

  const ship = async () => {
    setBusy(true);
    try {
      const result = await warehouseRequest<ShipResult>(`/api/warehouse/packages/${pkg.id}/actions`, "POST", {
        action: "ship",
        carrier: carrier.trim() || null,
        tracking_number: tracking.trim() || null,
      });
      if (result.failed.length > 0) {
        toast.error({
          title: `${result.failed.length} order${result.failed.length === 1 ? "" : "s"} could not move`,
          description: result.failed.map((f) => `${f.order_no}: ${f.reason}`).join(" · "),
        });
      } else {
        toast.success({
          title: `${pkg.reference} is on its way`,
          description: `${pluralise(orders, "customer order")} moved to in transit and notified.`,
        });
        onOpenChange(false);
      }
      router.refresh();
    } catch (error) {
      toast.error({ title: "Could not ship it", description: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[20px] font-bold text-tm-ink">Ship {pkg.reference}</DialogTitle>
          <DialogDescription className="text-[13px] font-medium text-tm-text-2">
            {orders > 0
              ? `${pluralise(orders, "order")} move to "in transit" and each customer gets their shipping update. This cannot be undone here.`
              : "Marks the package as gone from the hub."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-tm-ink">Carrier</span>
            <input
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              maxLength={80}
              placeholder="e.g. DHL, Ethiopian Cargo"
              className="h-10 rounded-[12px] border border-tm-border bg-card px-3 text-[13.5px] font-medium text-tm-ink outline-none placeholder:text-tm-text-3 focus:border-tm-coral/60"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-tm-ink">Waybill / tracking</span>
            <input
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              maxLength={80}
              placeholder="Shown to customers"
              className="h-10 rounded-[12px] border border-tm-border bg-card px-3 font-mono text-[13.5px] font-medium text-tm-ink outline-none placeholder:font-sans placeholder:text-tm-text-3 focus:border-tm-coral/60"
            />
          </label>
        </div>
        {pkg.label_print_count === 0 ? (
          <p className="flex items-center gap-2 rounded-[12px] bg-tm-amber-bg px-3 py-2.5 text-[12.5px] font-medium text-[#7a4a06]">
            <TriangleAlertIcon className="size-4 shrink-0" aria-hidden />
            No label has been printed for this package yet.
          </p>
        ) : null}
        <DialogFooter>
          <AdminButton variant="quiet" onClick={() => onOpenChange(false)}>
            Not yet
          </AdminButton>
          <AdminButton variant="primary" busy={busy} onClick={ship}>
            <PlaneTakeoffIcon className="size-4" aria-hidden />
            Ship it
          </AdminButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
