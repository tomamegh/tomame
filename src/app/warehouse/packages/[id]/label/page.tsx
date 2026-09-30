import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { LabelToolbar, type LabelMode } from "@/features/warehouse/label/label-toolbar";
import { code128Svg, qrSvg } from "@/features/warehouse/label/codes";
import { Label2x1, Label4x6, Manifest } from "@/features/warehouse/label/package-label";
import {
  getWarehousePackage,
  getWarehouseReturnAddress,
} from "@/features/warehouse/services/warehouse.service";
import { packageScanPath } from "@/features/warehouse/types";
import { APIError } from "@/lib/auth/api-helpers";
import { requireAuth } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Label" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODES: LabelMode[] = ["4x6", "roll80", "2x1", "manifest"];

/**
 * `/warehouse/packages/:id/label` — print surface (081). The shell renders no
 * chrome here; the toolbar is hidden when printing, and the page is the label
 * at its physical size.
 */
export default async function PackageLabelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = requireAuth(await getAuthenticatedUser());
  const query = await searchParams;
  const mode = MODES.find((m) => m === query.size) ?? "4x6";

  let pkg;
  try {
    pkg = await getWarehousePackage(user, id);
  } catch (error) {
    if (error instanceof APIError && error.statusCode === 404) notFound();
    throw error;
  }
  const address = await getWarehouseReturnAddress(user);

  const origin = (process.env.NEXT_PUBLIC_APP_URL ?? "https://tomame.ca").replace(/\/$/, "");
  const scanUrl = `${origin}${packageScanPath(pkg.reference)}`;
  const codes = { qr: qrSvg(scanUrl), barcode: code128Svg(pkg.reference), scanUrl };

  return (
    <LabelToolbar pkg={{ id: pkg.id, reference: pkg.reference, status: pkg.status, printed: pkg.label_print_count }} mode={mode}>
      {mode === "4x6" ? <Label4x6 pkg={pkg} codes={codes} address={address} /> : null}
      {mode === "roll80" ? <Label4x6 pkg={pkg} codes={codes} address={address} format="roll80" /> : null}
      {mode === "2x1" ? <Label2x1 pkg={pkg} codes={codes} /> : null}
      {mode === "manifest" ? <Manifest pkg={pkg} codes={codes} address={address} /> : null}
    </LabelToolbar>
  );
}
