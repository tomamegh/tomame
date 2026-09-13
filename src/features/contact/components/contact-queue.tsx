"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EnvelopeSimple } from "@phosphor-icons/react/ssr";

import type { ContactMessageRow, ContactMessageStatus } from "@/db/queries/contact-messages";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiFetchError, apiFetch } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import type { ApiSuccessResponse } from "@/types/api";
import { cn } from "@/lib/utils";

const TABS: { key: ContactMessageStatus | "all"; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "answered", label: "Answered" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

/**
 * Messages sent through `/contact`.
 *
 * This queue exists because the form did not have one: it discarded every
 * message on submit while telling the sender they would hear back within hours.
 * Plain by design — an internal work list, not a designed screen. What it must
 * do is show the sender's own words and give one click to reply.
 */
export function ContactQueue() {
  const [tab, setTab] = useState<ContactMessageStatus | "all">("open");
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery<ContactMessageRow[]>({
    queryKey: ["contact-queue", tab],
    queryFn: async () => {
      const qs = tab === "all" ? "" : `?status=${tab}`;
      const res = await apiFetch<ApiSuccessResponse<ContactMessageRow[]>>(`/api/admin/contact-messages${qs}`);
      return res.data;
    },
  });

  const move = useMutation<
    ContactMessageRow,
    Error,
    { id: string; from: ContactMessageStatus; status: "answered" | "closed" }
  >({
    mutationFn: async ({ id, ...body }) => {
      const res = await apiFetch<ApiSuccessResponse<ContactMessageRow>>(`/api/admin/contact-messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.data;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["contact-queue"] }),
  });

  const onMove = useCallback(
    (row: ContactMessageRow, to: "answered" | "closed") => {
      move.mutate(
        { id: row.id, from: row.status, status: to },
        {
          onError: (error) => {
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
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : !data?.length ? (
        <p className="rounded-xl border border-stone-200 bg-white px-5 py-10 text-center text-sm text-stone-500">
          Nothing here.
        </p>
      ) : (
        <ul className="space-y-3">
          {data.map((row) => (
            <li key={row.id} className="rounded-xl border border-stone-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-sm font-semibold text-stone-800">{row.subject}</p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-stone-600">{row.message}</p>
                  <p className="text-xs text-stone-400">
                    {row.name} · {row.email} · {new Date(row.created_at).toLocaleString("en-GB")}
                    {row.answered_at && ` · answered ${new Date(row.answered_at).toLocaleString("en-GB")}`}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <a
                    href={`mailto:${row.email}?subject=${encodeURIComponent(`Re: ${row.subject}`)}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-stone-200 px-3 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50"
                  >
                    <EnvelopeSimple weight="fill" className="size-4 text-stone-500" aria-hidden />
                    Reply
                  </a>
                  {row.status === "open" && (
                    <Button size="sm" onClick={() => onMove(row, "answered")} disabled={move.isPending}>
                      Mark answered
                    </Button>
                  )}
                  {row.status !== "closed" && (
                    <Button size="sm" variant="outline" onClick={() => onMove(row, "closed")} disabled={move.isPending}>
                      Close
                    </Button>
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
