import type { Metadata } from "next";

import { AdminPage } from "@/components/layout/admin";
import { AssistedQueue } from "@/features/assisted/components/assisted-queue";

export const metadata: Metadata = {
  title: "Assisted requests · Tomame admin",
};

/**
 * `/admin/assisted-requests` — the frame.
 *
 * The queue itself is a client island: it is worked, not read, and every row has
 * a note to write and a transition to make. It fetches from
 * `GET /api/admin/assisted-requests`, which authorizes itself; `src/proxy.ts`
 * gates the whole `/admin` prefix on the `admin` role besides.
 */
export default function AdminAssistedRequestsPage() {
  return (
    <AdminPage
      title="Assisted requests"
      blurb="Customers whose link we could not read, in their own words. Each one has been told a person will get back to them, so work the top of the list first."
    >
      <AssistedQueue />
    </AdminPage>
  );
}
