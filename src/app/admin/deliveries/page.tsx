import type { Metadata } from "next";

import { AdminCard, AdminPage, AdminStat } from "@/components/layout/admin/admin-page";
import {
  ADMIN_DELIVERIES_PAGE_SIZE,
  getDeliveryPipelineCounts,
  getShipmentFacts,
  listAdminDeliveries,
} from "@/db/queries/admin-deliveries";
import {
  DELIVERY_FILTERS,
  DELIVERY_FILTER_ORDER,
  deliveryFilterCount,
  deliveryFilterOf,
  reconcileShipments,
} from "@/features/deliveries/delivery-filters";
import { AdminDeliveriesBoard } from "@/features/deliveries/components/admin-deliveries-board";
import {
  AdminFilterPills,
  type AdminFilterPill,
} from "@/components/layout/admin";

export const metadata: Metadata = { title: "Deliveries · Admin" };

/**
 * `/admin/deliveries` — every order past payment, and where it has got to.
 *
 * A server component, filtered through the URL. It replaces a client island that
 * fetched `/api/admin/deliveries`, held its stage filter in `useState` and
 * computed its four figures by counting a fetched array in the browser.
 *
 * The stage words are `journey-stage.ts`'s — "Purchased", "In the air" —
 * because a buyer on WhatsApp and the customer they are talking to should be
 * looking at one vocabulary, not translating between two.
 */
export default async function AdminDeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = single(params.status);
  const origin = single(params.origin);
  // Fix 15: one definition per filter for tiles, chips and list (delivery-filters.ts).
  const filter = deliveryFilterOf(status);

  const [counts, deliveries, shipmentFacts] = await Promise.all([
    getDeliveryPipelineCounts(),
    listAdminDeliveries({ status: filter, originCountry: origin }),
    getShipmentFacts(),
  ]);
  const reconciliation = reconcileShipments(shipmentFacts);

  const href = (extra: Record<string, string> = {}) => {
    const query = new URLSearchParams(extra);
    if (origin) query.set("origin", origin);
    const qs = query.toString();
    return qs ? `/admin/deliveries?${qs}` : "/admin/deliveries";
  };

  const pills: AdminFilterPill[] = DELIVERY_FILTER_ORDER.map((key) => ({
    label: DELIVERY_FILTERS[key].label,
    href: key === "moving" ? href() : href({ status: key }),
    active: filter === key,
    count: deliveryFilterCount(key, counts),
  }));

  return (
    <AdminPage
      title="Deliveries"
      blurb="Every order that has been paid for, from the buyer picking it up to the customer signing for it."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStat
          index={0}
          label="Purchased"
          value={String(counts.processing)}
          detail="Bought from the store, on the way to our hub"
          tone={counts.processing > 0 ? "coral" : "muted"}
          href="/admin/deliveries?status=processing"
        />
        <AdminStat
          index={1}
          label="In the air"
          value={String(counts.in_transit)}
          detail="Shipped, not yet delivered"
          tone={counts.in_transit > 0 ? "coral" : "muted"}
          href="/admin/deliveries?status=in_transit"
        />
        <AdminStat
          index={2}
          label="No tracking"
          value={String(counts.untracked)}
          // Amber and not red: this is an action a person owes a customer, which
          // is exactly what amber means across this console.
          detail={
            counts.untracked > 0
              ? "Shipped with nothing for the customer to follow"
              : "Every shipped order has a number"
          }
          tone={counts.untracked > 0 ? "amber" : "green"}
          href="/admin/deliveries?status=in_transit"
        />
        <AdminStat
          index={3}
          label="Delivered"
          value={String(deliveryFilterCount("delivered", counts))}
          detail="Signed for, all time"
          tone="green"
          href="/admin/deliveries?status=delivered"
        />
      </div>

      <AdminFilterPills pills={pills} label="Filter deliveries by stage" />

      <AdminDeliveriesBoard
        deliveries={deliveries}
        filterSummary={describeFilter(filter === "moving" ? undefined : DELIVERY_FILTERS[filter].label, origin)}
        truncated={deliveries.length >= ADMIN_DELIVERIES_PAGE_SIZE}
      />

      {/* Fix 15: why "packages shipped" and "orders delivered" are different numbers. */}
      <AdminCard
        index={2}
        title="Shipped packages and delivered orders"
        blurb={reconciliation.agree ? "Every delivered order left in a shipped package." : "The two counts differ, and here is why."}
      >
        <ul className="flex flex-col gap-1.5 text-[13px] leading-[1.5] font-medium text-tm-text-2">
          {reconciliation.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </AdminCard>
    </AdminPage>
  );
}

function describeFilter(status?: string, origin?: string): string | null {
  const parts: string[] = [];
  if (status) parts.push(`stage “${status}”`);
  if (origin) parts.push(`origin “${origin}”`);
  return parts.length > 0 ? parts.join(" and ") : null;
}

/** A repeated query parameter is a URL somebody hand-edited; take the first. */
function single(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}
