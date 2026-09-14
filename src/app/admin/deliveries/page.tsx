import type { Metadata } from "next";

import { AdminPage, AdminStat } from "@/components/layout/admin/admin-page";
import {
  ADMIN_DELIVERIES_PAGE_SIZE,
  DELIVERY_PIPELINE_STATUSES,
  getDeliveryPipelineCounts,
  listAdminDeliveries,
} from "@/db/queries/admin-deliveries";
import { AdminDeliveriesBoard } from "@/features/deliveries/components/admin-deliveries-board";
import {
  AdminFilterPills,
  type AdminFilterPill,
} from "@/components/layout/admin";
import { adminStatusLabel } from "@/features/orders/components/admin-transitions";

export const metadata: Metadata = { title: "Deliveries · Tomame admin" };

/**
 * `/admin/deliveries` — every order past payment, and where it has got to.
 *
 * A server component, filtered through the URL. It replaces a client island that
 * fetched `/api/admin/deliveries`, held its stage filter in `useState` and
 * computed its four figures by counting a fetched array in the browser.
 *
 * The stage words are `journey-stage.ts`'s — "Being purchased", "In the air" —
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

  const [counts, deliveries] = await Promise.all([
    getDeliveryPipelineCounts(),
    listAdminDeliveries({ status, originCountry: origin }),
  ]);

  const href = (extra: Record<string, string> = {}) => {
    const query = new URLSearchParams(extra);
    if (origin) query.set("origin", origin);
    const qs = query.toString();
    return qs ? `/admin/deliveries?${qs}` : "/admin/deliveries";
  };

  const pills: AdminFilterPill[] = [
    {
      label: "Everything moving",
      href: href(),
      active: !status,
      count: DELIVERY_PIPELINE_STATUSES.reduce((sum, stage) => sum + counts[stage], 0),
    },
    ...DELIVERY_PIPELINE_STATUSES.map((stage) => ({
      label: adminStatusLabel(stage),
      href: href({ status: stage }),
      active: status === stage,
      count: counts[stage],
    })),
  ];

  return (
    <AdminPage
      title="Deliveries"
      blurb="Every order that has been paid for, from the buyer picking it up to the customer signing for it."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStat
          index={0}
          label="Being purchased"
          value={String(counts.processing)}
          detail="A buyer is placing these with the store"
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
          value={String(counts.delivered + counts.completed)}
          detail="Signed for, all time"
          tone="green"
          href="/admin/deliveries?status=delivered"
        />
      </div>

      <AdminFilterPills pills={pills} label="Filter deliveries by stage" />

      <AdminDeliveriesBoard
        deliveries={deliveries}
        filterSummary={describeFilter(status, origin)}
        truncated={deliveries.length >= ADMIN_DELIVERIES_PAGE_SIZE}
      />
    </AdminPage>
  );
}

function describeFilter(status?: string, origin?: string): string | null {
  const parts: string[] = [];
  if (status) parts.push(`stage “${adminStatusLabel(status)}”`);
  if (origin) parts.push(`origin “${origin}”`);
  return parts.length > 0 ? parts.join(" and ") : null;
}

/** A repeated query parameter is a URL somebody hand-edited; take the first. */
function single(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}
