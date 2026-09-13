"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, MagnifyingGlass } from "@phosphor-icons/react/ssr";

import {
  ADMIN_TD,
  ADMIN_TH,
  ADMIN_TR,
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminTableScroller,
} from "@/components/layout/admin";
import type { AdminPaymentStatus, AdminTransactionRow } from "@/db/queries/admin-money";
import { formatRelativeTime } from "@/features/app-home/components/format";
import { cn } from "@/lib/utils";
import {
  channelLabel,
  customerName,
  formatPesewas,
  transactionStatusLabel,
  transactionTone,
} from "./admin-money-format";

type StatusFilter = "all" | AdminPaymentStatus;

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "success", label: "Paid" },
  { id: "pending", label: "Unsettled" },
  { id: "failed", label: "Failed" },
];

export interface AdminTransactionsViewProps {
  rows: AdminTransactionRow[];
  /** How many rows the query was allowed to return, so the card can say so. */
  limit: number;
  /** Server render time, ISO — relative ages are struck from this, not the clock. */
  renderedAt: string;
}

/**
 * The transactions ledger.
 *
 * Filtering happens over rows the server already sent rather than through a
 * round trip: the page is capped at `limit` and an admin scanning for a
 * reference wants the answer on the keystroke. When the cap is reached the card
 * says which window it is showing — a filtered view that silently searched only
 * the newest 200 charges would be a quiet lie.
 *
 * Every amount on this screen is pesewas coming in and cedis going out, and the
 * conversion happens only in `formatPesewas`.
 */
export function AdminTransactionsView({ rows, limit, renderedAt }: AdminTransactionsViewProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const now = useMemo(() => new Date(renderedAt), [renderedAt]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!needle) return true;
      const name = customerName(row.customer) ?? "";
      return (
        row.reference.toLowerCase().includes(needle) ||
        name.toLowerCase().includes(needle) ||
        row.id.toLowerCase().includes(needle)
      );
    });
  }, [rows, query, status]);

  const windowed = rows.length >= limit;

  return (
    <AdminCard
      title="Ledger"
      blurb={
        windowed
          ? `The most recent ${limit} charges. Search covers this window only.`
          : undefined
      }
      flush
      index={1}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <MagnifyingGlass
              size={14}
              weight="bold"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-tm-text-3"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Reference or customer"
              aria-label="Search transactions by reference or customer"
              className="h-9 w-[220px] rounded-full border border-tm-border bg-tm-paper pr-3 pl-8 text-[13px] font-medium text-tm-ink outline-none placeholder:text-tm-text-3 focus:border-tm-coral/50"
            />
          </div>
          <div className="flex items-center gap-1" role="group" aria-label="Filter by status">
            {FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setStatus(filter.id)}
                aria-pressed={status === filter.id}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[12px] leading-none font-semibold transition-colors",
                  status === filter.id
                    ? "bg-tm-ink text-white"
                    : "bg-tm-paper text-tm-text-2 hover:text-tm-ink",
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {rows.length === 0 ? (
        <div className="p-5">
          <AdminEmpty
            title="No transactions yet"
            body="Nothing has been charged through Paystack. The first customer checkout will appear here the moment the charge is initialised."
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-5">
          <AdminEmpty
            title="Nothing matches"
            body="No charge in this window matches that search and filter. Clear one of them to widen it."
          />
        </div>
      ) : (
        <AdminTableScroller>
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr>
                <th className={ADMIN_TH}>Reference</th>
                <th className={ADMIN_TH}>Customer</th>
                <th className={cn(ADMIN_TH, "text-right")}>Amount</th>
                <th className={ADMIN_TH}>Status</th>
                <th className={ADMIN_TH}>Channel</th>
                <th className={ADMIN_TH}>Bought</th>
                <th className={ADMIN_TH}>Initiated</th>
                <th className={ADMIN_TH}>
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const name = customerName(row.customer);
                const channel = channelLabel(row.channel);
                const age = formatRelativeTime(row.created_at, now);
                return (
                  <tr key={row.id} className={ADMIN_TR}>
                    <td className={cn(ADMIN_TD, "font-mono text-[12px]")}>{row.reference}</td>
                    <td className={ADMIN_TD}>
                      {name ?? <span className="text-tm-text-3">No profile</span>}
                    </td>
                    <td className={cn(ADMIN_TD, "tm-nums text-right font-semibold")}>
                      {formatPesewas(row.amount)}
                    </td>
                    <td className={ADMIN_TD}>
                      <AdminBadge tone={transactionTone(row.status)}>
                        {transactionStatusLabel(row.status)}
                      </AdminBadge>
                    </td>
                    <td className={cn(ADMIN_TD, "text-tm-text-2")}>
                      {channel ?? <span className="text-tm-text-3">Not recorded</span>}
                    </td>
                    <td className={cn(ADMIN_TD, "tm-nums text-tm-text-2")}>
                      {row.order_group_id ? (
                        `${row.order_count} ${row.order_count === 1 ? "order" : "orders"}`
                      ) : (
                        <span className="text-tm-text-3">—</span>
                      )}
                    </td>
                    <td className={cn(ADMIN_TD, "tm-nums whitespace-nowrap text-tm-text-2")}>
                      {age ?? "—"}
                    </td>
                    <td className={cn(ADMIN_TD, "text-right")}>
                      <Link
                        href={`/admin/transactions/${row.id}`}
                        className="inline-flex items-center gap-1 text-[13px] font-semibold text-tm-coral-strong hover:underline"
                      >
                        Open
                        <ArrowRight size={13} weight="bold" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </AdminTableScroller>
      )}
    </AdminCard>
  );
}
