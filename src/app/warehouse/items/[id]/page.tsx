import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, BoxIcon, MapPinIcon, PhoneIcon, StickyNoteIcon } from "lucide-react";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import type { OrderStatus } from "@/features/orders/types";
import { AdminOrderParcelPanel } from "@/features/order-photos/components/admin-parcel-panel";
import { formatDateTime, formatLbs, recipientLines, STAGE_META } from "@/features/warehouse/components/format";
import { ItemActions } from "@/features/warehouse/components/item-actions";
import { ItemFlags, ItemThumb, PackageStatusBadge, StageBadge } from "@/features/warehouse/components/warehouse-ui";
import { getWarehouseItem } from "@/features/warehouse/services/warehouse.service";
import { APIError } from "@/lib/auth/api-helpers";
import { requireAuth } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Item" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `/warehouse/items/:orderId` — one parcel at the hub (081).
 *
 * This is where parcel feedback now lives: the photographs the customer sees,
 * what they said back, and the hold that stops the box. Folded in here rather
 * than kept as a separate queue because it is the same moment — the operator
 * is holding the parcel.
 */
export default async function WarehouseItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = requireAuth(await getAuthenticatedUser());

  let item;
  try {
    item = await getWarehouseItem(user, id);
  } catch (error) {
    if (error instanceof APIError && error.statusCode === 404) notFound();
    throw error;
  }

  const facts: Array<{ label: string; value: string }> = [
    { label: "Quantity", value: String(item.quantity) },
    { label: "Listed weight", value: item.listed_weight_lbs ? `${formatLbs(item.listed_weight_lbs)} each` : "Not listed" },
    { label: "Weighed at hub", value: item.received?.weight_lbs ? formatLbs(item.received.weight_lbs) : "—" },
    { label: "Arrived", value: item.received ? formatDateTime(item.received.at) : "Not yet" },
    { label: "Store", value: item.store ?? "—" },
    { label: "Freight box", value: item.box ? `${item.box.label ?? "Box"}${item.box.departs_at ? ` · ${formatDateTime(item.box.departs_at)}` : ""}` : "—" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/warehouse/receive"
        className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-tm-text-2 transition-colors hover:text-tm-ink"
      >
        <ArrowLeftIcon className="size-4" aria-hidden />
        Receive
      </Link>

      <section className="tm-up grid grid-cols-[minmax(0,1fr)] gap-5 rounded-[26px] border border-tm-border bg-card p-5 [animation-duration:0.5s] sm:grid-cols-[auto_minmax(0,1fr)] sm:p-6">
        <ItemThumb item={item} size={132} rounded={22} className="mx-auto sm:mx-0" />
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <StageBadge stage={item.stage} />
            <span className="text-[12px] font-medium text-tm-text-3">{STAGE_META[item.stage].hint}</span>
          </div>
          <h1 className="font-display text-[22px] leading-[1.15] font-bold tracking-[-0.01em] text-tm-ink sm:text-[26px]">
            {item.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-tm-text-2">
            <span className="rounded-full bg-tm-paper px-2.5 py-1 font-mono text-[12.5px] font-bold text-tm-ink">{item.order_no}</span>
            {item.package ? (
              <Link
                href={`/warehouse/packages/${item.package.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-tm-border px-2.5 py-1 font-mono text-[12.5px] font-bold text-tm-ink hover:border-tm-coral/40"
              >
                <BoxIcon className="size-3.5" aria-hidden />
                {item.package.reference}
                <PackageStatusBadge status={item.package.status} />
              </Link>
            ) : null}
          </div>
          <ItemFlags item={item} />
          {item.held ? (
            <p className="rounded-[14px] bg-tm-pill-bg px-3.5 py-2.5 text-[13px] font-medium text-tm-coral-strong">
              On hold: {item.held.reason}
            </p>
          ) : null}
          <ItemActions item={item} />
        </div>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div id="photos" className="flex min-w-0 scroll-mt-24 flex-col gap-6">
          <AdminOrderParcelPanel orderId={item.order_id} status={item.order_status as OrderStatus} index={1} />
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <section className="tm-up flex flex-col gap-3 rounded-[22px] border border-tm-border bg-card p-5 [animation-duration:0.5s] [animation-delay:.08s]">
            <h2 className="font-display text-[17px] leading-none font-bold text-tm-ink">Deliver to</h2>
            <span className="text-[15px] font-semibold text-tm-ink">{item.recipient.name ?? "Customer"}</span>
            {recipientLines(item.recipient).map((line) => (
              <span key={line} className="flex items-start gap-1.5 text-[13px] font-medium text-tm-text-2">
                <MapPinIcon className="mt-0.5 size-3.5 shrink-0 text-tm-text-3" aria-hidden />
                {line}
              </span>
            ))}
            {item.recipient.phone ? (
              <a href={`tel:${item.recipient.phone}`} className="flex items-center gap-1.5 text-[13px] font-semibold text-tm-coral-strong">
                <PhoneIcon className="size-3.5" aria-hidden />
                {item.recipient.phone}
              </a>
            ) : null}
          </section>

          <section className="tm-up rounded-[22px] border border-tm-border bg-card p-5 [animation-duration:0.5s] [animation-delay:.1s]">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5">
              {facts.map((fact) => (
                <div key={fact.label} className="flex min-w-0 flex-col gap-1">
                  <dt className="text-[11.5px] font-semibold text-tm-text-3">{fact.label}</dt>
                  <dd className="truncate text-[13.5px] font-semibold text-tm-ink">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {item.special_instructions ? (
            <section className="tm-up flex gap-3 rounded-[22px] border border-[#f5d9b0] bg-tm-amber-bg p-5 [animation-duration:0.5s] [animation-delay:.12s]">
              <StickyNoteIcon className="mt-0.5 size-4 shrink-0 text-tm-amber" aria-hidden />
              <div className="flex flex-col gap-1">
                <span className="text-[12px] font-bold text-[#7a4a06]">Customer instructions</span>
                <p className="text-[13px] leading-[1.5] font-medium text-[#7a4a06]">{item.special_instructions}</p>
              </div>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
