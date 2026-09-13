import type { Metadata } from "next";

import { AdminDashboard } from "@/features/admin/components/dashboard";
import { getAdminDashboard } from "@/features/admin/admin.service";

export const metadata: Metadata = {
  title: "Dashboard · Tomame admin",
};

/**
 * Never cached, and never statically rendered.
 *
 * Every figure here is a live operational count — a queue with somebody in it,
 * a box about to close. A dashboard served from the build's data would show an
 * admin an empty queue that has three people in it, which is worse than showing
 * them nothing.
 */
export const dynamic = "force-dynamic";

/**
 * `/admin` — the admin overview.
 *
 * A SERVER COMPONENT reading the service directly, rather than a client island
 * polling `/api/admin/dashboard`. The old page rendered a spinner, fetched ten
 * queries over HTTP and only then had anything to show; there is no interaction
 * on this screen that needs the browser to own the data, so the render and the
 * read happen in the same pass. The API route survives for anything that wants
 * the same figures as JSON, and carries its own authorization.
 *
 * No auth check here: `src/proxy.ts` gates the whole `/admin` prefix on the
 * `admin` role, and `src/app/admin/layout.tsx` explains why a second redirect in
 * the tree would only be a rule with two homes that drift apart.
 */
export default async function AdminPage() {
  const view = await getAdminDashboard();
  return <AdminDashboard view={view} />;
}
