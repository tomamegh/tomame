import type { Metadata } from "next";

import { AdminFilterPills, AdminPage, type AdminFilterPill } from "@/components/layout/admin";
import { getAdminQueueCounts } from "@/db/queries/admin-queues";
import type { OrderFeedbackStatus } from "@/db/queries/order-feedback";
import { FeedbackQueue } from "@/features/feedback/components/feedback-queue";

export const metadata: Metadata = {
  title: "Parcel feedback · Tomame admin",
};

const STATUSES = ["open", "in_review", "resolved", "dismissed"] as const;

/**
 * `/admin/feedback` — the frame.
 *
 * A server component holding a client island, the same split the assisted and
 * contact queues use: the list is WORKED rather than read, and each row has an
 * answer to write and a guarded transition to make.
 *
 * THE FILTER LIVES IN THE URL rather than in a `useState` inside the island, so
 * "everything waiting" is a view an admin can bookmark or send to a colleague —
 * and so the sidebar badge has somewhere to point. It is read here and handed
 * down as a prop; the island never touches `useSearchParams`, which would need a
 * Suspense boundary of its own for no gain.
 *
 * `GET /api/admin/order-feedback` authorizes itself, and `src/proxy.ts` gates
 * the whole `/admin` prefix on the `admin` role besides.
 */
export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = single(params.status);
  // Anything unrecognised means "everything", which is what the route does with
  // it too — a stale bookmark shows the whole queue rather than an error. No
  // parameter at all means the work: `open` is what an admin opens this for.
  const status: OrderFeedbackStatus | "all" = raw
    ? (STATUSES.find((s) => s === raw) ?? "all")
    : "open";

  const counts = await getAdminQueueCounts();

  return (
    <AdminPage
      title="Parcel feedback"
      blurb="What customers say when they see the photograph of their own parcel at the US hub. Nothing here stops a box on its own — if one should stop, you stop it."
      action={<AdminFilterPills pills={buildPills(status, counts.feedbackOpen)} label="Filter parcel feedback by status" />}
    >
      <FeedbackQueue status={status} />
    </AdminPage>
  );
}

/**
 * The pills.
 *
 * Only "Waiting" carries a number, and only when there is one: that is the count
 * the sidebar badge shows and the only figure an admin acts on. A "Sorted 412"
 * would be furniture.
 */
function buildPills(status: OrderFeedbackStatus | "all", open: number): AdminFilterPill[] {
  return [
    { label: "Waiting", href: "/admin/feedback", active: status === "open", count: open },
    {
      label: "Being looked at",
      href: "/admin/feedback?status=in_review",
      active: status === "in_review",
    },
    {
      label: "Sorted",
      href: "/admin/feedback?status=resolved",
      active: status === "resolved",
    },
    {
      label: "Nothing in it",
      href: "/admin/feedback?status=dismissed",
      active: status === "dismissed",
    },
    { label: "All", href: "/admin/feedback?status=all", active: status === "all" },
  ];
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
