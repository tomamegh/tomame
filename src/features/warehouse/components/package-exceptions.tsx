"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRightIcon, TriangleAlertIcon } from "lucide-react";

import { AdminButton } from "@/components/layout/admin/controls";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import type { WarehousePackage } from "../types";
import { packageExceptions, PACKAGE_STUCK_AFTER_DAYS, type PackageExceptionKind } from "./format";
import { errorText, warehouseRequest } from "./warehouse-actions";

const KIND_LABEL: Record<PackageExceptionKind, string> = {
  cannot_ship: "Cannot ship",
  stuck: "Stuck",
  held: "Held",
  empty: "Empty",
};

/**
 * 112, site brief Fix 10: the bench's exception list. Sealed packages that cannot
 * ship, have sat sealed for a week or more, or are held, each with its age and the
 * way out; and the empty packages nobody used, cleared in one click.
 */
export function PackageExceptions({ boxes }: { boxes: readonly WarehousePackage[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // One clock per render keeps every "N days" on the list consistent.
  const exceptions = useMemo(() => packageExceptions(boxes, new Date()), [boxes]);
  if (exceptions.length === 0) return null;
  const empties = exceptions.filter((e) => e.kind === "empty").length;
  const work = exceptions.filter((e) => e.kind !== "empty");

  const cleanup = async () => {
    setBusy(true);
    try {
      const res = await warehouseRequest<{ deleted: number }>("/api/warehouse/packages/cleanup", "POST", {});
      toast.success({ title: `${res.deleted} empty ${res.deleted === 1 ? "package" : "packages"} deleted` });
      router.refresh();
    } catch (error) {
      toast.error({ title: "Couldn't clean up", description: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="exceptions-heading" className="flex flex-col gap-2.5 rounded-[20px] border border-[#f5d9b0] bg-tm-amber-bg/60 p-4">
      <h2 id="exceptions-heading" className="flex items-center gap-2 text-[14px] font-bold text-[#7a4a06]">
        <TriangleAlertIcon className="size-4 text-tm-amber" aria-hidden />
        Needs attention
      </h2>
      {work.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {work.map((e) => (
            <li key={e.pkg.id}>
              <Link
                href={`/warehouse/packages/${e.pkg.id}`}
                className="flex items-center gap-3 rounded-[14px] bg-card px-3 py-2.5 transition-colors hover:bg-tm-paper"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[13px] font-bold text-tm-ink">{e.pkg.reference}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        e.kind === "held" ? "bg-tm-paper text-tm-text-2" : "bg-tm-amber-bg text-[#7a4a06]",
                      )}
                    >
                      {KIND_LABEL[e.kind]}
                    </span>
                    <span className="tm-nums text-[12px] font-medium text-tm-text-3">
                      sealed {e.age_days} {e.age_days === 1 ? "day" : "days"} ago
                    </span>
                  </span>
                  <span className="text-[12.5px] leading-[1.4] font-medium text-tm-text-2">{e.detail}</span>
                </span>
                <ChevronRightIcon className="size-4 shrink-0 text-tm-text-3" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {empties > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] bg-card px-3 py-2.5">
          <span className="text-[12.5px] font-medium text-tm-text-2">
            {empties} empty {empties === 1 ? "package has" : "packages have"} been open a day or more with nothing in {empties === 1 ? "it" : "them"}.
          </span>
          <AdminButton variant="secondary" className="h-9" busy={busy} onClick={cleanup}>
            Delete {empties === 1 ? "it" : `all ${empties}`}
          </AdminButton>
        </div>
      ) : null}
      <p className="text-[11.5px] font-medium text-tm-text-3">A sealed package counts as stuck after {PACKAGE_STUCK_AFTER_DAYS} days.</p>
    </section>
  );
}
