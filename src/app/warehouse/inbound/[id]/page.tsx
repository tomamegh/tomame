import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

import { InboundParcelActions, InboundStatusBadge } from "@/features/warehouse/components/inbound";
import { formatDateTime } from "@/features/warehouse/components/format";
import { getInboundParcelView, toOrderRef } from "@/features/warehouse/services/inbound.service";
import { warehousePageUser } from "@/features/warehouse/services/page-user";
import { listWarehouseItems } from "@/features/warehouse/services/warehouse.service";
import { APIError } from "@/lib/auth/api-helpers";

export const metadata: Metadata = { title: "Parcel" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `/warehouse/inbound/:id` — one store parcel and the orders inside it (086). */
export default async function WarehouseInboundParcelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await warehousePageUser(`/warehouse/inbound/${id}`);
  const query = await searchParams;

  let parcel;
  try {
    parcel = await getInboundParcelView(user, id);
  } catch (error) {
    if (error instanceof APIError && error.statusCode === 404) notFound();
    throw error;
  }
  const bench = await listWarehouseItems(user);
  const candidates = bench.filter((i) => i.stage === "awaiting" || i.stage === "received").map(toOrderRef);

  const facts = [
    { label: "Carrier", value: parcel.carrier_label },
    { label: "Store order", value: parcel.store_order_ref ?? "–" },
    { label: parcel.source === "registered" ? "Added by" : "Logged by", value: parcel.registered_by_name ?? "–" },
    { label: "Added", value: formatDateTime(parcel.created_at) },
    { label: "Arrived", value: parcel.arrived_at ? formatDateTime(parcel.arrived_at) : "Not yet" },
    { label: "Scanned in by", value: parcel.arrived_by_name ?? "–" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/warehouse/inbound?tab=${parcel.status}`}
        className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-tm-text-2 transition-colors hover:text-tm-ink"
      >
        <ArrowLeftIcon className="size-4" aria-hidden />
        Inbound
      </Link>

      <header className="tm-up flex flex-col gap-2 [animation-duration:0.5s]">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold tracking-[0.16em] text-tm-coral-strong uppercase">Store parcel</span>
          <InboundStatusBadge status={parcel.status} />
        </span>
        <h1 className="font-mono text-[22px] leading-tight font-bold break-all text-tm-ink sm:text-[28px]">
          {parcel.tracking_display}
        </h1>
        {parcel.note ? <p className="text-[13.5px] font-medium text-tm-text-2">{parcel.note}</p> : null}
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <InboundParcelActions parcel={parcel} candidates={candidates} openReceive={query.receive === "1"} />
        </div>
        <aside className="tm-up rounded-[22px] border border-tm-border bg-card p-5 [animation-duration:0.5s] [animation-delay:.08s]">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5">
            {facts.map((fact) => (
              <div key={fact.label} className="flex min-w-0 flex-col gap-1">
                <dt className="text-[11.5px] font-semibold text-tm-text-3">{fact.label}</dt>
                <dd className="truncate text-[13.5px] font-semibold text-tm-ink">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>
    </div>
  );
}
