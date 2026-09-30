import type { Metadata } from "next";

import { AdminPage } from "@/components/layout/admin";
import { OpsOverviewView } from "@/features/ops/components/ops-overview";
import { OpsNotifyPanel } from "@/features/ops/components/ops-notify-panel";
import { getOpsNotifyView } from "@/features/ops/ops-notify.service";
import { getOpsOverview } from "@/features/ops/ops.service";

export const metadata: Metadata = {
  title: "Health · Admin",
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
  const notify = await getOpsNotifyView(view);
  return (
    <AdminPage
      title="Health"
      blurb="Payments that never settle, jobs that stop running, messages that stay pending. This screen watches for absence, not just errors."
    >
      <div className="flex flex-col gap-6">
        <OpsOverviewView view={view} />
        <OpsNotifyPanel view={notify} renderedAt={view.generatedAt} index={8} />
      </div>
    </AdminPage>
  );
}
