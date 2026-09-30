import type { Metadata } from "next";
import Link from "next/link";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { PACKAGE_META } from "@/features/warehouse/components/format";
import { PackageBox } from "@/features/warehouse/components/package-box";
import { PackageCard } from "@/features/warehouse/components/package-card";
import { NewPackageButton } from "@/features/warehouse/components/warehouse-actions";
import { WarehouseHeading } from "@/features/warehouse/components/warehouse-ui";
import { listWarehousePackages } from "@/features/warehouse/services/warehouse.service";
import type { PackageStatus } from "@/features/warehouse/types";
import { requireAuth } from "@/lib/auth/guards";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Packages" };
export const dynamic = "force-dynamic";

const STATUSES: PackageStatus[] = ["packing", "sealed", "shipped"];

/** `/warehouse/packages` — every box, by where it is in its life (081). */
export default async function WarehousePackagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = requireAuth(await getAuthenticatedUser());
  const params = await searchParams;
  const status = STATUSES.find((s) => s === params.status);
  const all = await listWarehousePackages(user, { limit: 200 });
  const packages = status ? all.filter((p) => p.status === status) : all.filter((p) => p.status !== "shipped");
  const counts = Object.fromEntries(STATUSES.map((s) => [s, all.filter((p) => p.status === s).length])) as Record<
    PackageStatus,
    number
  >;

  const pills: Array<{ href: string; label: string; count: number; active: boolean }> = [
    { href: "/warehouse/packages", label: "On the bench", count: counts.packing + counts.sealed, active: !status },
    ...STATUSES.map((s) => ({
      href: `/warehouse/packages?status=${s}`,
      label: PACKAGE_META[s].label,
      count: counts[s],
      active: status === s,
    })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <WarehouseHeading
        kicker="Outbound"
        title="Packages"
        blurb="Every box the hub has packed. Tap one to open it and see what is inside."
        action={<NewPackageButton variant="primary" />}
      />

      <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0" aria-label="Filter packages">
        {pills.map((pill) => (
          <Link
            key={pill.href}
            href={pill.href}
            aria-current={pill.active ? "page" : undefined}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold transition-colors",
              pill.active ? "border-tm-ink bg-tm-ink text-white" : "border-tm-border bg-card text-tm-text-2 hover:text-tm-ink",
            )}
          >
            {pill.label}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[11px] leading-none font-bold",
                pill.active ? "bg-white/20 text-white" : "bg-tm-paper text-tm-text-3",
              )}
            >
              {pill.count}
            </span>
          </Link>
        ))}
      </nav>

      {packages.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[22px] border border-dashed border-tm-border bg-card px-6 py-14 text-center">
          <PackageBox status={status ?? "packing"} size={96} />
          <p className="font-display text-[17px] font-bold text-tm-ink">
            {status ? `No ${PACKAGE_META[status].label.toLowerCase()} packages` : "Nothing on the bench"}
          </p>
          <p className="max-w-[44ch] text-[13px] font-medium text-tm-text-2">
            Start one from the shelf on Receive, or open an empty package and scan items into it.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {packages.map((pkg, i) => (
            <PackageCard key={pkg.id} pkg={pkg} index={Math.min(i, 12)} />
          ))}
        </div>
      )}
    </div>
  );
}
