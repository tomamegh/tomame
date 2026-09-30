import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { WarehouseShell } from "@/features/warehouse/components/warehouse-shell";
import { canAccessAdmin, canAccessWarehouse } from "@/lib/auth/admin-access";

export const metadata: Metadata = {
  title: { default: "Warehouse", template: "%s · Warehouse · Tomame" },
  robots: { index: false, follow: false },
};

/**
 * The packaging platform (081) — its own shell, not the admin's.
 *
 * A warehouse operator must never see the admin sidebar: it lists every screen
 * by name and badge counts across the business, which is itself a leak. So the
 * platform has a separate chrome with five destinations and nothing else.
 *
 * `src/proxy.ts` gates `/warehouse` already. The check here is not a second
 * redirect (the admin layout explains why that drifts); it is a `notFound()`
 * for the case the proxy was bypassed, so the page renders nothing at all.
 */
export default async function WarehouseLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthenticatedUser();
  if (!user || !canAccessWarehouse(user)) notFound();

  const name =
    [user.profile?.first_name, user.profile?.last_name].filter(Boolean).join(" ").trim() ||
    user.email?.split("@")[0] ||
    "Operator";

  return (
    <WarehouseShell operator={{ name, email: user.email ?? null, isAdmin: canAccessAdmin(user) }}>
      {children}
    </WarehouseShell>
  );
}
