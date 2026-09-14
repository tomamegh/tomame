"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLinkIcon, Loader2Icon, MessageCircleIcon, RefreshCwIcon } from "lucide-react";

import {
  ADMIN_TD,
  ADMIN_TH,
  ADMIN_TR,
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminStat,
  AdminTableScroller,
} from "@/components/layout/admin";
import type { AdminPasteFilter } from "@/db/queries/admin-pastes";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeTime } from "@/features/app-home/components/format";
import { ApiFetchError, apiFetch } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import type { ApiSuccessResponse } from "@/types/api";
import {
  canRereadPaste,
  formatAttempts,
  formatRate,
  pasteStatusLabel,
  pasteStatusTone,
  rereadBlockedReason,
  type AdminPasteView,
  type PasteCoverage,
  type StorePasteSummary,
} from "./admin-paste-format";

/**
 * `/admin/pastes` — the paste queue, and where the reader is losing.
 *
 * WHY THIS SCREEN EXISTS. Extraction has been a background job since 049 and had
 * no administration at all: an admin could see that a badge said "7 failed" and
 * had no way to find out what those seven were, let alone which store they were
 * on. Extraction coverage is the business's biggest operational problem, so the
 * question this screen has to answer is not "is anything broken" but "WHERE, and
 * what can I do about it right now".
 *
 * Three things, in that order: what the machine is failing on by store, the
 * failures themselves, and one button that reads a link again.
 *
 * Nothing here is computed in the browser. The service counts the rows and this
 * renders what it was handed — including whether a re-read would help, which
 * depends on job state the client must never guess at.
 */

const FILTERS: { key: AdminPasteFilter; label: string }[] = [
  { key: "failed", label: "Failed" },
  { key: "unfinished", label: "In flight" },
  { key: "all", label: "All" },
];

/** How many host rows are worth showing before the tail stops being actionable. */
const HOST_ROWS = 12;

interface AdminPasteQueuePayload {
  filter: AdminPasteFilter;
  rows: AdminPasteView[];
  hosts: StorePasteSummary[];
  coverage: PasteCoverage;
  counts: { pending: number; running: number; ready: number; failed: number };
  windowDays: number;
  renderedAt: string;
}

export function AdminPasteQueue() {
  const [filter, setFilter] = useState<AdminPasteFilter>("failed");
  // WHICH row is being re-read, not merely that one is. The mutation object is
  // shared by the whole list, so keying a spinner off `isPending` puts every row
  // into the reading state at once — the same bug the customer paste list had.
  const [rerunningId, setRerunningId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery<AdminPasteQueuePayload>({
    queryKey: ["admin-pastes", filter],
    queryFn: async () => {
      const res = await apiFetch<ApiSuccessResponse<AdminPasteQueuePayload>>(
        `/api/admin/pastes?filter=${filter}`,
      );
      return res.data;
    },
  });

  const rerun = useMutation<unknown, Error, string>({
    mutationFn: (id) =>
      apiFetch(`/api/admin/pastes/${id}/rerun`, { method: "POST" }),
    onSettled: () => {
      setRerunningId(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-pastes"] });
    },
  });

  const onRerun = useCallback(
    (row: AdminPasteView) => {
      setRerunningId(row.id);
      rerun.mutate(row.id, {
        onSuccess: () => {
          toast.success({
            title: "Reading it again",
            description: `${row.host} is back on the queue. Refresh in a minute to see how it went.`,
          });
        },
        onError: (error) => {
          // A 409 means the sweep or another admin claimed it between the page
          // loading and the click. That is the guard working, not a fault.
          if (error instanceof ApiFetchError && error.status === 409) {
            toast.info({ title: "Already in hand", description: error.message });
            return;
          }
          toast.error({ title: "Could not queue that", description: error.message });
        },
      });
    },
    [rerun],
  );

  return (
    <div className="flex flex-col gap-5">
      <PasteStats data={data} isPending={isPending} />

      <FailingStores data={data} isPending={isPending} />

      <AdminCard
        title="The queue"
        blurb="Newest first. A failure the customer is looking at now matters more than one from three weeks ago."
        index={2}
        action={
          <FilterTabs value={filter} onChange={setFilter} />
        }
      >
        {isPending ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-[16px]" />
            ))}
          </div>
        ) : !data?.rows.length ? (
          <AdminEmpty
            title={emptyTitle(filter)}
            body={emptyBody(filter)}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {data.rows.map((row) => (
              <PasteRow
                key={row.id}
                row={row}
                busy={rerunningId === row.id}
                onRerun={() => onRerun(row)}
              />
            ))}
          </ul>
        )}
      </AdminCard>
    </div>
  );
}

// ── Headline figures ─────────────────────────────────────────────────────────

function PasteStats({
  data,
  isPending,
}: {
  data: AdminPasteQueuePayload | undefined;
  isPending: boolean;
}) {
  if (isPending || !data) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[108px] w-full rounded-[20px]" />
        ))}
      </div>
    );
  }

  const { coverage, counts, windowDays } = data;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <AdminStat
        index={0}
        label={`Read rate, ${windowDays} days`}
        value={formatRate(coverage.read_rate)}
        // Named, not implied: a rate over "finished" excludes the jobs still in
        // flight, and an admin comparing this with the queue length deserves to
        // know which denominator it is.
        detail={
          coverage.finished > 0
            ? `${coverage.read} read of ${coverage.finished} finished`
            : "Nothing has finished in the window yet"
        }
        // No threshold colouring. Any line drawn at "80% is green, 79% is amber"
        // would be invented here rather than agreed anywhere, and the tile next
        // to this one already carries the signal.
        tone="neutral"
      />
      <AdminStat
        index={1}
        label={`Gave up, ${windowDays} days`}
        value={String(coverage.failed)}
        detail={coverage.failed > 0 ? "Each one is a customer who saw a dead link" : "Nothing has failed"}
        tone={coverage.failed > 0 ? "amber" : "green"}
      />
      <AdminStat
        index={2}
        label="Waiting to read"
        value={String(counts.pending)}
        detail={counts.pending > 0 ? "The sweep takes these a few at a time" : "The queue is clear"}
        tone="neutral"
      />
      <AdminStat
        index={3}
        label="Reading now"
        value={String(counts.running)}
        detail={counts.running > 0 ? "Workers hold these right now" : "No worker is running"}
        tone="neutral"
      />
    </div>
  );
}

// ── Which stores are failing ─────────────────────────────────────────────────

function FailingStores({
  data,
  isPending,
}: {
  data: AdminPasteQueuePayload | undefined;
  isPending: boolean;
}) {
  const shown = useMemo(() => data?.hosts.slice(0, HOST_ROWS) ?? [], [data]);
  const tail = useMemo(() => data?.hosts.slice(HOST_ROWS) ?? [], [data]);
  // What the tail actually contains, not what the sort makes it tempting to
  // assume. The list is ordered by failures, so the hidden hosts have the FEWEST
  // — which is not the same as none, and a footer claiming none would be the
  // screen's one lie.
  const hiddenFailures = useMemo(() => tail.reduce((sum, host) => sum + host.failed, 0), [tail]);

  return (
    <AdminCard
      title="Which stores are failing"
      blurb={
        data
          ? `Every host pasted in the last ${data.windowDays} days, most failures first. This is the number that decides where the next resolver goes.`
          : "Every host pasted recently, most failures first."
      }
      index={1}
      flush={!isPending && shown.length > 0}
    >
      {isPending ? (
        <Skeleton className="h-40 w-full rounded-[16px]" />
      ) : shown.length === 0 ? (
        <AdminEmpty
          title="No pastes in the window"
          body="Nobody has pasted a link recently, so there is nothing to count. This fills in on its own the moment somebody does."
        />
      ) : (
        <>
          <AdminTableScroller>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={ADMIN_TH}>Store</th>
                  <th className={cn(ADMIN_TH, "text-right")}>Read</th>
                  <th className={cn(ADMIN_TH, "text-right")}>Failed</th>
                  <th className={cn(ADMIN_TH, "text-right")}>In flight</th>
                  <th className={cn(ADMIN_TH, "text-right")}>Failure rate</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((host) => (
                  <tr key={host.host} className={ADMIN_TR}>
                    <td className={ADMIN_TD}>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-tm-ink">{host.host}</span>
                        <span className="text-[12px] leading-none font-medium text-tm-text-3">
                          {storeCaption(host)}
                        </span>
                      </div>
                    </td>
                    <td className={cn(ADMIN_TD, "tm-nums text-right text-tm-text-2")}>{host.read}</td>
                    <td
                      className={cn(
                        ADMIN_TD,
                        "tm-nums text-right font-semibold",
                        host.failed > 0 ? "text-tm-amber" : "text-tm-text-3",
                      )}
                    >
                      {host.failed}
                    </td>
                    <td className={cn(ADMIN_TD, "tm-nums text-right text-tm-text-3")}>
                      {host.unfinished}
                    </td>
                    <td className={cn(ADMIN_TD, "tm-nums text-right font-semibold")}>
                      {formatRate(host.failure_rate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableScroller>
          {tail.length > 0 ? (
            <p className="border-t border-tm-hairline px-5 py-3 text-[12px] leading-[1.4] font-medium text-tm-text-3">
              <span className="tm-nums">{tail.length}</span> more{" "}
              {tail.length === 1 ? "host was" : "hosts were"} pasted in the window
              {hiddenFailures > 0 ? (
                <>
                  , between them failing <span className="tm-nums">{hiddenFailures}</span>{" "}
                  {hiddenFailures === 1 ? "time" : "times"}.
                </>
              ) : (
                <> and none of them failed.</>
              )}
            </p>
          ) : null}
        </>
      )}
    </AdminCard>
  );
}

/** "Amazon · live" for a registered store; the honest alternative when it is not one. */
function storeCaption(host: StorePasteSummary): string {
  if (!host.store_name) return "Not a registered store, read by the generic plan";
  return `${host.store_name} · ${host.store_status}`;
}

// ── One paste ────────────────────────────────────────────────────────────────

function PasteRow({
  row,
  busy,
  onRerun,
}: {
  row: AdminPasteView;
  busy: boolean;
  onRerun: () => void;
}) {
  // The browser's own clock, read once per mount. Every row renders after its
  // query resolves, so there is no server render for this to disagree with.
  const now = useMemo(() => new Date(), []);
  const age = formatRelativeTime(row.updated_at, now);
  const canReread = canRereadPaste(row);
  const blocked = rereadBlockedReason(row);

  return (
    <li className="flex flex-col gap-3 rounded-[16px] border border-tm-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-[15px] leading-none font-bold text-tm-ink">
            {row.host}
          </span>
          <AdminBadge tone={pasteStatusTone(row.status, row.stalled)}>
            {pasteStatusLabel(row.status, row.stalled)}
          </AdminBadge>
          {row.assisted ? (
            <AdminBadge tone="coral">
              <MessageCircleIcon className="size-3.5" aria-hidden />
              With a buyer
            </AdminBadge>
          ) : null}
        </div>

        <a
          href={row.product_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-full items-center gap-1.5 text-[12px] leading-[1.4] font-medium text-tm-text-3 transition-colors hover:text-tm-coral-strong"
        >
          <ExternalLinkIcon className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{row.product_url}</span>
        </a>

        {/*
          The customer-readable error, verbatim. This is the sentence the person
          who pasted the link was shown, so an admin reading the queue and an
          admin reading a complaint are looking at the same words.
        */}
        {row.error ? (
          <p className="rounded-[12px] bg-tm-amber-bg px-3 py-2 text-[13px] leading-[1.45] font-medium text-[#7a4a06]">
            {row.error}
          </p>
        ) : null}

        <p className="text-[12px] leading-[1.4] font-medium text-tm-text-3">
          <span className="tm-nums">{formatAttempts(row.attempts)}</span>
          {age ? <> · {age}</> : null}
          {" · "}
          {row.owner === "customer" ? "signed-in customer" : "signed-out visitor"}
          {row.store_name ? <> · {row.store_name}</> : <> · not a registered store</>}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-stretch gap-1.5 sm:items-end">
        <Button
          size="sm"
          onClick={onRerun}
          disabled={!canReread || busy}
          className="tm-cta-gradient border-0 text-white hover:opacity-90 disabled:opacity-45"
          aria-busy={busy}
        >
          {busy ? (
            <Loader2Icon className="size-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCwIcon className="size-4" aria-hidden />
          )}
          {busy ? "Queuing…" : "Read it again"}
        </Button>
        {blocked ? (
          <p className="max-w-[26ch] text-[11px] leading-[1.35] font-medium text-tm-text-3 sm:text-right">
            {blocked}
          </p>
        ) : null}
        {row.assisted ? (
          <Link
            href="/admin/assisted-requests"
            className="text-[11px] leading-none font-semibold text-tm-coral-strong underline-offset-2 hover:underline sm:text-right"
          >
            Open the assisted queue
          </Link>
        ) : null}
      </div>
    </li>
  );
}

// ── Chrome ───────────────────────────────────────────────────────────────────

function FilterTabs({
  value,
  onChange,
}: {
  value: AdminPasteFilter;
  onChange: (filter: AdminPasteFilter) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter the paste queue">
      {FILTERS.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={() => onChange(f.key)}
          aria-pressed={value === f.key}
          className={cn(
            "h-8 rounded-full px-3.5 text-[13px] leading-none font-semibold transition-colors",
            value === f.key
              ? "bg-tm-ink text-white"
              : "bg-tm-paper text-tm-text-2 hover:bg-tm-tint hover:text-tm-ink",
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

function emptyTitle(filter: AdminPasteFilter): string {
  if (filter === "failed") return "Nothing has failed";
  if (filter === "unfinished") return "Nothing is in flight";
  return "Nobody has pasted a link yet";
}

function emptyBody(filter: AdminPasteFilter): string {
  if (filter === "failed") {
    return "Every link the extractor has been given has come back with a price. Failures land here the moment one does not.";
  }
  if (filter === "unfinished") {
    return "No job is queued or running. A paste appears here for the seconds it takes to read, and stays if a worker dies on it.";
  }
  return "The queue fills as customers paste links on the Buy-for-me screen.";
}
