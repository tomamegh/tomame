import type { Metadata } from "next";

import { AdminPage } from "@/components/layout/admin";
import { SourcingQueue } from "@/features/sourcing/components/sourcing-queue";

export const metadata: Metadata = {
  title: "Sourcing requests · Tomame admin",
};

/**
 * `/admin/sourcing-requests` — the frame (065).
 *
 * The queue itself is a client island: it is worked, not read, and every row has
 * a price to enter and a decision to make. It fetches from
 * `GET /api/admin/sourcing-requests`, which authorizes itself; `src/proxy.ts`
 * gates the whole `/admin` prefix on the `admin` role besides.
 */
export default function AdminSourcingRequestsPage() {
  return (
    <AdminPage
      title="Sourcing requests"
      blurb="Items the pricing engine could not handle. Each one is sitting in a customer's bag and cannot be paid for until you price it, so work the top of the list first."
    >
      <SourcingQueue />
    </AdminPage>
  );
}
