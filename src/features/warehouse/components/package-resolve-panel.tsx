"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlertIcon, HandIcon, ShieldCheckIcon } from "lucide-react";

import { AdminButton } from "@/components/layout/admin/controls";
import { toast } from "@/lib/sonner";
import type { WarehousePackage } from "../types";
import { errorText, warehouseRequest } from "./warehouse-actions";

const FIELD =
  "h-10 w-full min-w-0 rounded-[12px] border border-tm-border bg-card px-3 text-[13px] text-tm-ink placeholder:text-tm-text-3 focus-visible:border-tm-coral/50 focus-visible:outline-none";

type Mode = "hold" | "void" | "seal" | null;

/**
 * 112, site brief Fix 10: every sealed package has a way out. Hold it with a
 * reason, release it, seal past a finished order with a reason, or (a manager)
 * resolve a package whose orders were already delivered as a record error.
 */
export function PackageResolvePanel({ pkg, isManager }: { pkg: WarehousePackage; isManager: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [text, setText] = useState("");
  const [voidReason, setVoidReason] = useState<"record_error" | "duplicate">("record_error");
  const [busy, setBusy] = useState(false);
  const finished = pkg.finished_order_nos;

  const send = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      await warehouseRequest(`/api/warehouse/packages/${pkg.id}/actions`, "POST", body);
      toast.success({ title: done });
      setMode(null);
      setText("");
      router.refresh();
    } catch (error) {
      toast.error({ title: "That didn't go through", description: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  if (pkg.status === "voided" && pkg.void) {
    return (
      <Notice tone="muted" icon={<ShieldCheckIcon className="size-4 shrink-0" aria-hidden />}>
        Resolved as {pkg.void.reason === "duplicate" ? "a duplicate" : "a record error"}
        {pkg.void.by_name ? ` by ${pkg.void.by_name}` : ""}: {pkg.void.note}
      </Notice>
    );
  }
  if (pkg.status !== "sealed" && pkg.status !== "packing") return null;
  const showSealOverride = pkg.status === "packing" && finished.length > 0;
  if (pkg.status === "packing" && !showSealOverride) return null;

  return (
    <div className="flex flex-col gap-2.5">
      {finished.length > 0 ? (
        <Notice tone="amber" icon={<CircleAlertIcon className="size-4 shrink-0" aria-hidden />}>
          {finished.join(", ")} {finished.length === 1 ? "is" : "are"} already delivered or closed.{" "}
          {pkg.status === "sealed"
            ? "This package cannot ship as it is: unseal it and take them out, or a manager resolves it as a record error."
            : "Take them out before sealing, or seal with a reason."}
          {pkg.seal_override_reason ? ` Sealed anyway: ${pkg.seal_override_reason}` : ""}
        </Notice>
      ) : null}
      {pkg.hold ? (
        <Notice tone="amber" icon={<HandIcon className="size-4 shrink-0" aria-hidden />}>
          Held{pkg.hold.by_name ? ` by ${pkg.hold.by_name}` : ""}: {pkg.hold.reason}
        </Notice>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {pkg.status === "sealed" && !pkg.hold ? (
          <AdminButton variant="quiet" className="h-9" onClick={() => setMode(mode === "hold" ? null : "hold")}>
            Hold with a reason
          </AdminButton>
        ) : null}
        {pkg.hold ? (
          <AdminButton variant="secondary" className="h-9" busy={busy} onClick={() => send({ action: "release" }, `${pkg.reference} released`)}>
            Release hold
          </AdminButton>
        ) : null}
        {showSealOverride ? (
          <AdminButton variant="quiet" className="h-9" onClick={() => setMode(mode === "seal" ? null : "seal")}>
            Seal anyway, with a reason
          </AdminButton>
        ) : null}
        {finished.length > 0 ? (
          isManager ? (
            <AdminButton variant="quiet" className="h-9" onClick={() => setMode(mode === "void" ? null : "void")}>
              Resolve as record error
            </AdminButton>
          ) : (
            <span className="self-center text-[12px] font-medium text-tm-text-3">A manager (admin) can resolve it as a record error.</span>
          )
        ) : null}
      </div>

      {mode ? (
        <div className="flex flex-col gap-2 rounded-[14px] border border-tm-border bg-tm-paper/60 p-3 sm:flex-row sm:items-center">
          {mode === "void" ? (
            <select className={`${FIELD} sm:w-[150px]`} value={voidReason} onChange={(e) => setVoidReason(e.target.value as typeof voidReason)} aria-label="Resolution">
              <option value="record_error">Record error</option>
              <option value="duplicate">Duplicate</option>
            </select>
          ) : null}
          <input
            className={FIELD}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={mode === "void" ? 1000 : 500}
            placeholder={mode === "hold" ? "Why is it held?" : mode === "seal" ? "Why seal it anyway?" : "What happened, for the record"}
            aria-label="Reason"
          />
          <AdminButton
            variant="primary"
            className="h-10 shrink-0 px-4"
            busy={busy}
            disabled={!text.trim()}
            onClick={() =>
              mode === "hold"
                ? send({ action: "hold", hold_reason: text }, `${pkg.reference} held`)
                : mode === "seal"
                  ? send({ action: "seal", override_reason: text }, `${pkg.reference} sealed`)
                  : send({ action: "void", void_reason: voidReason, note: text }, `${pkg.reference} resolved`)
            }
          >
            {mode === "hold" ? "Hold" : mode === "seal" ? "Seal" : "Resolve"}
          </AdminButton>
        </div>
      ) : null}
    </div>
  );
}

function Notice({ tone, icon, children }: { tone: "amber" | "muted"; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p
      className={
        tone === "amber"
          ? "flex gap-2 rounded-[12px] bg-tm-amber-bg px-3 py-2 text-[12.5px] leading-[1.45] font-medium text-[#7a4a06]"
          : "flex gap-2 rounded-[12px] bg-tm-paper px-3 py-2 text-[12.5px] leading-[1.45] font-medium text-tm-text-2"
      }
    >
      <span className="mt-[1px]">{icon}</span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}
