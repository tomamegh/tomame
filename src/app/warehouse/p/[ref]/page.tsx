import { notFound, redirect } from "next/navigation";
import { warehousePageUser } from "@/features/warehouse/services/page-user";

import { lookupWarehouseCode } from "@/features/warehouse/services/warehouse.service";
import { APIError } from "@/lib/auth/api-helpers";

export const dynamic = "force-dynamic";

/**
 * `/warehouse/p/PKG-10042` — what a label's QR code opens (081).
 *
 * A phone's own camera app opens this URL. Signed-in staff land on the
 * package; anyone else meets the proxy's sign-in redirect first (with `next`
 * set back here), so a stranger who scans a label at an airport sees a login
 * screen and nothing about who or what is inside.
 */
export default async function PackageScanPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const user = await warehousePageUser(`/warehouse/p/${encodeURIComponent(ref)}`);
  let target;
  try {
    target = await lookupWarehouseCode(user, decodeURIComponent(ref));
  } catch (error) {
    if (error instanceof APIError && (error.statusCode === 404 || error.statusCode === 400)) notFound();
    throw error;
  }
  redirect(
    target.kind === "package"
      ? `/warehouse/packages/${target.id}?scanned=1`
      : `/warehouse/items/${target.id}`,
  );
}
