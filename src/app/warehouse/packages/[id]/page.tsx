import type { Metadata } from "next";
import { warehousePageUser } from "@/features/warehouse/services/page-user";
import { notFound } from "next/navigation";

import { PackageWorkbench } from "@/features/warehouse/components/package-workbench";
import { getWarehousePackage } from "@/features/warehouse/services/warehouse.service";
import { APIError } from "@/lib/auth/api-helpers";

export const metadata: Metadata = { title: "Package" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `/warehouse/packages/:id` — one package: contents, details, seal, label, ship (081). */
export default async function WarehousePackagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await warehousePageUser(`/warehouse/packages/${id}`);
  const query = await searchParams;

  try {
    const pkg = await getWarehousePackage(user, id);
    return <PackageWorkbench pkg={pkg} openAdd={query.add === "1"} scanned={query.scanned === "1"} />;
  } catch (error) {
    if (error instanceof APIError && error.statusCode === 404) notFound();
    throw error;
  }
}
