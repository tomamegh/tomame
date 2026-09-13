"use client";

import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AdminBadge } from "@/components/layout/admin";
import { formatGhs } from "@/features/marketing/format";
import type { AdminDeliveryZoneRow } from "@/db/queries/admin-content";

import { feeChangeWarning, isFeeChange } from "./admin-content-format";
import {
  CONTENT_INPUT_CLASS,
  ContentField,
  ContentSaveButton,
  useContentPatch,
} from "./admin-content-fields";

/**
 * `delivery_zones` — Ghana-side delivery, and the fee charged for it.
 *
 * `fee_ghs` IS MONEY. It is added once per checkout on the bag's chosen zone
 * (CLAUDE.md's bag pricing), so a change here changes what customers pay from
 * the moment it saves. Every fee change is therefore confirmed with both
 * figures named, and the route audits it as `delivery_zone_fee_updated` with
 * the old and new values — the same treatment a pricing constant gets.
 *
 * There is no threshold below which a change is waved through. The mistake this
 * guards against is a typo, and a typo has no size.
 *
 * Deactivating a zone is the other consequential switch: `listActiveDeliveryZones`
 * is what the storefront and the checkout selector read, so an inactive zone
 * stops being offerable — and the marketing "delivery from" figure is derived
 * from the active set, so it moves too.
 */
export function AdminZonesPanel({ zones }: { zones: readonly AdminDeliveryZoneRow[] }) {
  return (
    <div className="flex flex-col divide-y divide-tm-hairline">
      {zones.map((zone) => (
        <ZoneRow key={zone.id} zone={zone} />
      ))}
    </div>
  );
}

function ZoneRow({ zone }: { zone: AdminDeliveryZoneRow }) {
  const [fee, setFee] = useState(zone.fee_ghs.toString());
  const [extraDays, setExtraDays] = useState(zone.extra_days.toString());
  const [note, setNote] = useState(zone.note ?? "");
  const [isActive, setIsActive] = useState(zone.is_active);
  const [confirming, setConfirming] = useState(false);
  const { patch, isSaving } = useContentPatch();

  const parsedFee = Number(fee);
  const feeValid = Number.isFinite(parsedFee) && parsedFee >= 0;
  const parsedDays = Number(extraDays);
  const daysValid = Number.isInteger(parsedDays) && parsedDays >= 0;

  const isDirty =
    fee !== zone.fee_ghs.toString() ||
    extraDays !== zone.extra_days.toString() ||
    note !== (zone.note ?? "") ||
    isActive !== zone.is_active;

  const feeChanged = feeValid && isFeeChange(zone.fee_ghs, parsedFee);

  async function save() {
    await patch(
      {
        target: "zone",
        id: zone.id,
        fee_ghs: parsedFee,
        extra_days: parsedDays,
        note: note.trim() || null,
        is_active: isActive,
      },
      {
        successTitle: `${zone.name} updated`,
        successDescription: feeChanged
          ? `Checkout now charges ${formatGhs(parsedFee)} for this zone.`
          : isActive
            ? "Offered at checkout."
            : "No longer offered at checkout.",
      },
    );
    setConfirming(false);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!feeValid || !daysValid) return;
    // A fee change goes through the confirmation; everything else saves
    // straight away, because nothing else on this row is a price.
    if (feeChanged) setConfirming(true);
    else void save();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] leading-none font-semibold text-tm-ink">
              {zone.name}
            </span>
            <AdminBadge tone={zone.kind === "pickup" ? "neutral" : "muted"}>
              {zone.kind === "pickup" ? "Pickup point" : "Door delivery"}
            </AdminBadge>
            {zone.is_active ? (
              <AdminBadge tone="green">Offered at checkout</AdminBadge>
            ) : (
              <AdminBadge tone="muted">Not offered</AdminBadge>
            )}
          </div>
          <p className="tm-nums text-[12px] leading-none font-medium text-tm-text-3">
            Currently {zone.fee_ghs === 0 ? "free" : formatGhs(zone.fee_ghs)}
            {zone.extra_days > 0
              ? ` · ${zone.extra_days} extra ${zone.extra_days === 1 ? "day" : "days"}`
              : null}
          </p>
        </div>
        <ContentSaveButton isDirty={isDirty} isSaving={isSaving} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ContentField
          label="Fee (GH₵)"
          htmlFor={`zone-fee-${zone.id}`}
          help="Charged once per checkout when a customer picks this zone. 0 means free."
        >
          <input
            id={`zone-fee-${zone.id}`}
            type="number"
            min={0}
            step="0.01"
            value={fee}
            onChange={(event) => setFee(event.target.value)}
            aria-invalid={!feeValid}
            className={`${CONTENT_INPUT_CLASS} tm-nums`}
          />
        </ContentField>

        <ContentField
          label="Extra days"
          htmlFor={`zone-days-${zone.id}`}
          help="Added to the delivery estimate for this zone."
        >
          <input
            id={`zone-days-${zone.id}`}
            type="number"
            min={0}
            step={1}
            value={extraDays}
            onChange={(event) => setExtraDays(event.target.value)}
            aria-invalid={!daysValid}
            className={`${CONTENT_INPUT_CLASS} tm-nums`}
          />
        </ContentField>

        <ContentField
          label="Note"
          htmlFor={`zone-note-${zone.id}`}
          help="Shown beside the zone at checkout."
          className="sm:col-span-2"
        >
          <input
            id={`zone-note-${zone.id}`}
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className={CONTENT_INPUT_CLASS}
          />
        </ContentField>
      </div>

      <label className="flex w-fit cursor-pointer items-center gap-2.5 text-[13px] font-semibold text-tm-text-2">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
          className="size-4 accent-[var(--tm-coral)]"
        />
        Offer this zone at checkout
      </label>

      {!feeValid ? (
        <p className="text-[12px] leading-[1.45] font-semibold text-tm-coral-strong">
          The fee must be a number of cedis, zero or more.
        </p>
      ) : null}

      <AlertDialog open={confirming} onOpenChange={(open) => !isSaving && setConfirming(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change what this zone costs?</AlertDialogTitle>
            <AlertDialogDescription>
              {feeChangeWarning(zone.name, zone.fee_ghs, parsedFee)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isSaving}
              onClick={(event) => {
                event.preventDefault();
                void save();
              }}
              className="bg-tm-coral text-white hover:bg-tm-coral-strong"
            >
              Change the fee
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
