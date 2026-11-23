"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExternalLinkIcon, LinkIcon, Trash2Icon } from "lucide-react";

import { toast } from "@/lib/sonner";

import { errorText, warehouseRequest } from "./warehouse-actions";

/** The host and path, short enough for one line: "a.co/d/0c8Ijdes". */
export function shortLinkText(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}`.slice(0, 48);
  } catch {
    return url.slice(0, 48);
  }
}

/**
 * The store's tracking page on an order (141): Amazon's Share tracking and the
 * like, which carry no number. Staff open it here; the hub cannot scan it, so
 * the line says so.
 */
export function StoreLinkRow({ orderId, url, canRemove = true }: { orderId: string; url: string; canRemove?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      await warehouseRequest(`/api/warehouse/orders/${orderId}/tracking-link`, "DELETE");
      toast.success({ title: "Tracking link removed" });
      router.refresh();
    } catch (error) {
      toast.error({ title: "Could not remove it", description: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-[12px] border border-tm-hairline px-3 py-2">
      <LinkIcon className="size-4 shrink-0 text-tm-text-3" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-semibold text-tm-ink">{shortLinkText(url)}</span>
        <span className="text-[11.5px] font-medium text-tm-text-3">Store tracking page. The hub scans by number, so add it when you have it.</span>
      </span>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-tm-text-3 hover:bg-tm-paper hover:text-tm-ink"
        aria-label="Open the store's tracking page"
      >
        <ExternalLinkIcon className="size-4" />
      </a>
      {canRemove ? (
        <button
          type="button"
          disabled={busy}
          onClick={remove}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-tm-text-3 hover:bg-tm-pill-bg hover:text-tm-coral-strong"
          aria-label="Remove the tracking link"
        >
          <Trash2Icon className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
