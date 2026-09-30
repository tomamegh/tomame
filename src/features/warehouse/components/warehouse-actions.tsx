"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BoxIcon, PlusIcon } from "lucide-react";

import { AdminButton, type AdminButtonProps } from "@/components/layout/admin/controls";
import { apiFetch } from "@/lib/api-client";
import { toast } from "@/lib/sonner";

import type { WarehousePackage } from "../types";

/**
 * The warehouse's client-side verbs (081). Every mutation goes to
 * `/api/warehouse/*` and ends in `router.refresh()`, so the server pages stay
 * the one source of what is on screen.
 */

export async function warehouseRequest<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await apiFetch<{ data: T }>(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.data;
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}

/** Put these orders in a brand-new package and go to it. */
export function PackItemsButton({
  orderIds,
  label,
  variant = "primary",
  className,
}: {
  orderIds: string[];
  label?: string;
  variant?: AdminButtonProps["variant"];
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const pkg = await warehouseRequest<WarehousePackage>("/api/warehouse/packages", "POST", {
        order_ids: orderIds,
      });
      toast.success({
        title: `${pkg.reference} started`,
        description: `${orderIds.length} item${orderIds.length === 1 ? "" : "s"} packed. Weigh it and print the label.`,
      });
      router.push(`/warehouse/packages/${pkg.id}`);
      router.refresh();
    } catch (error) {
      toast.error({ title: "Could not start the package", description: errorText(error) });
      setBusy(false);
    }
  };

  return (
    <AdminButton variant={variant} busy={busy} onClick={run} disabled={orderIds.length === 0} className={className}>
      <BoxIcon className="size-4" aria-hidden />
      {label ?? `Pack ${orderIds.length === 1 ? "it" : `these ${orderIds.length}`}`}
    </AdminButton>
  );
}

/** An empty package, for when the operator wants to scan items into it. */
export function NewPackageButton({ variant = "secondary" }: { variant?: AdminButtonProps["variant"] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const pkg = await warehouseRequest<WarehousePackage>("/api/warehouse/packages", "POST", {});
      router.push(`/warehouse/packages/${pkg.id}?add=1`);
      router.refresh();
    } catch (error) {
      toast.error({ title: "Could not start a package", description: errorText(error) });
      setBusy(false);
    }
  };
  return (
    <AdminButton variant={variant} busy={busy} onClick={run}>
      <PlusIcon className="size-4" aria-hidden />
      New package
    </AdminButton>
  );
}
