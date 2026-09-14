import type { Metadata } from "next";

import { AdminPage } from "@/components/layout/admin";
import { OpsOverviewView } from "@/features/ops/components/ops-overview";
import { getOpsOverview } from "@/features/ops/ops.service";

export const metadata: Metadata = {
  title: "Health · Tomame admin",
};

export const dynamic = "force-dynamic";

/**
 * `/admin/ops` — is anything failing quietly?
 *
 * A server component reading `getOpsOverview()` in the same pass it renders,
 * like `/admin`. The proxy gates the `/admin` prefix on the admin role.
 */
export default async function AdminOpsPage() {
  const view = await getOpsOverview();
  return (
    <AdminPage
      title="Health"
      blurb="Payments that never settle, jobs that stop running, messages that stay pending. This screen watches for absence, not just errors."
    >
      <OpsOverviewView view={view} />
    </AdminPage>
  );
}
