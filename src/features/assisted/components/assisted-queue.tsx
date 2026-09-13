"use client";

import { useCallback, useState } from "react";
import { ArrowSquareOut, WhatsappLogo } from "@phosphor-icons/react/ssr";

import type { AssistedRequestRow, AssistedRequestStatus } from "@/db/queries/assisted-requests";
import { whatsappHref } from "@/components/layout/marketing/links";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiFetchError } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import { useAssistedQueue, useMoveAssistedRequest } from "../hooks/useAssistedQueue";

const TABS: { key: AssistedRequestStatus | "all"; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "contacted", label: "Contacted" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
];

/**
 * The buyer's queue for "we could not read that page, tell us what you want".
 *
 * Deliberately plain: this is an internal work list, not a designed screen. What
 * it has to do is put the customer's own words, their number and the link in one
 * place, and make "I have messaged them" one click.
 *
 * Each row carries a `wa.me` link built from the number the CUSTOMER gave on the
 * form — not from `site_settings`, which is Tomame's own number. Getting those
 * two the wrong way round would have a buyer message themselves.
 */
export function AssistedQueue() {
  const [tab, setTab] = useState<AssistedRequestStatus | "all">("open");
  const { data, isPending } = useAssistedQueue(tab);
  const move = useMoveAssistedRequest();

  const onMove = useCallback(
    (row: AssistedRequestRow, to: "contacted" | "resolved" | "cancelled") => {
      move.mutate(
        { id: row.id, from: row.status, status: to },
        {
          onError: (error) => {
            // A 409 means another buyer moved it first — that is information, not
            // a fault, so it is said plainly rather than as an error.
            if (error instanceof ApiFetchError && error.status === 409) {
              toast.info({ title: "Someone else picked this one up", description: "The queue has been refreshed." });
              return;
            }
            toast.error({ title: "Could not update that", description: error.message });
          },
        },
      );
    },
    [move],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "h-9 rounded-full px-4 text-sm font-semibold transition-colors",
              tab === t.key ? "bg-stone-800 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : !data?.length ? (
        <p className="rounded-xl border border-stone-200 bg-white px-5 py-10 text-center text-sm text-stone-500">
          Nothing here. Requests arrive when extraction cannot read a page and the customer asks for help.
        </p>
      ) : (
        <ul className="space-y-3">
          {data.map((row) => (
            <li key={row.id} className="rounded-xl border border-stone-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-sm leading-relaxed text-stone-800">&ldquo;{row.description}&rdquo;</p>
                  <a
                    href={row.product_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-full items-center gap-1.5 text-xs text-stone-500 hover:text-stone-700"
                  >
                    <ArrowSquareOut className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{row.product_url}</span>
                  </a>
                  <p className="text-xs text-stone-400">
                    {new Date(row.created_at).toLocaleString("en-GB")} · {row.phone}
                    {row.contacted_at && ` · contacted ${new Date(row.contacted_at).toLocaleString("en-GB")}`}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <WhatsappButton phone={row.phone} />
                  {row.status === "open" && (
                    <Button size="sm" onClick={() => onMove(row, "contacted")} disabled={move.isPending}>
                      Mark contacted
                    </Button>
                  )}
                  {(row.status === "open" || row.status === "contacted") && (
                    <Button size="sm" variant="outline" onClick={() => onMove(row, "resolved")} disabled={move.isPending}>
                      Resolve
                    </Button>
                  )}
                  {row.status !== "open" && (
                    <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600">
                      {row.status}
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Opens WhatsApp to the CUSTOMER's number, the one they typed on the form. */
function WhatsappButton({ phone }: { phone: string }) {
  const href = whatsappHref(phone);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-stone-200 px-3 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50"
    >
      <WhatsappLogo weight="fill" className="size-4 text-emerald-600" aria-hidden />
      Message
    </a>
  );
}
