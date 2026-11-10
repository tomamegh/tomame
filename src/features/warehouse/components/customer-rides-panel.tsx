"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CarIcon, ClockIcon, ExternalLinkIcon, HandshakeIcon, PhoneIcon } from "lucide-react";

import { AdminButton } from "@/components/layout/admin/controls";
import type { CustomerRideRequest } from "@/features/order-delivery/customer-ride";
import { formatGhanaPhone } from "@/features/order-delivery/schema";
import { toast } from "@/lib/sonner";

import type { WarehouseItem } from "../types";
import { formatRelative } from "./format";
import { errorText, warehouseRequest } from "./warehouse-actions";
import { ItemThumb } from "./warehouse-ui";

/**
 * Customers sending their own rider to the Accra warehouse (101), on top of the
 * shipments board because someone is on their way. "Hand over" gives the rider
 * the parcel: the customer's order page switches to the rider card.
 */
export function CustomerRidesPanel({ rides }: { rides: Array<{ item: WarehouseItem; ride: CustomerRideRequest }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  if (rides.length === 0) return null;

  const handOver = async (item: WarehouseItem) => {
    setBusy(item.order_id);
    try {
      await warehouseRequest(`/api/warehouse/rides/${item.order_id}/handover`, "POST");
      toast.success({ title: `${item.order_no} handed over`, description: "The customer can see their rider has it." });
      router.refresh();
    } catch (error) {
      toast.error({ title: "Could not hand it over", description: errorText(error) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="flex items-center gap-1.5 text-[12px] font-bold tracking-[0.12em] text-tm-coral-strong uppercase">
        <CarIcon className="size-3.5" aria-hidden />
        Customers&apos; riders coming
      </h2>
      <ul className="flex flex-col gap-2">
        {rides.map(({ item, ride }) => (
          <li key={item.order_id} className="flex flex-wrap items-center gap-3 rounded-[18px] border border-tm-coral/40 bg-tm-tint/40 p-3">
            <ItemThumb item={item} size={44} rounded={12} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <Link href={`/warehouse/items/${item.order_id}`} className="font-mono text-[14px] font-bold text-tm-ink hover:underline">
                  {item.order_no}
                </Link>
                <span className="min-w-0 truncate text-[13px] font-medium text-tm-text-2">{item.title}</span>
              </div>
              <span className="text-[12.5px] font-medium text-tm-text-2">
                For {item.recipient.name ?? "the customer"}
                {item.package ? ` · in ${item.package.reference}` : ""}
              </span>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] font-medium text-tm-text-2">
                <span className="inline-flex items-center gap-1">
                  <ClockIcon className="size-3.5" aria-hidden />
                  {ride.eta ? formatEta(ride.eta) : "Time not given"}
                </span>
                {ride.riderPhone ? (
                  <a href={`tel:${ride.riderPhone}`} className="inline-flex items-center gap-1 text-tm-ink hover:underline">
                    <PhoneIcon className="size-3.5" aria-hidden />
                    {ride.riderName ? `${ride.riderName} · ` : ""}
                    {formatGhanaPhone(ride.riderPhone)}
                  </a>
                ) : ride.riderName ? (
                  <span>{ride.riderName}</span>
                ) : null}
                {ride.trackingUrl ? (
                  <a href={ride.trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-tm-ink hover:underline">
                    <ExternalLinkIcon className="size-3.5" aria-hidden />
                    Trip
                  </a>
                ) : null}
                <span className="text-tm-text-3">asked {formatRelative(ride.requestedAt).toLowerCase()}</span>
              </div>
              {ride.note ? <span className="text-[12.5px] text-tm-text-2">“{ride.note}”</span> : null}
            </div>
            <AdminButton variant="primary" busy={busy === item.order_id} onClick={() => handOver(item)}>
              <HandshakeIcon className="size-4" aria-hidden />
              Hand over
            </AdminButton>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatEta(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `Arriving ${new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" }).format(date)}`;
}
