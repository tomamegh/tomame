import Link from "next/link";

import {
  ADMIN_TD,
  ADMIN_TH,
  ADMIN_TR,
  AdminBadge,
  AdminEmpty,
  AdminTableScroller,
} from "@/components/layout/admin";
import { formatCount } from "@/features/admin/components/dashboard-format";
import { cn } from "@/lib/utils";

import { itemHref, verdictLabel } from "../describe";
import { formatDuration } from "../metrics";
import type { DurationStats, IssueSummary, OperatorRow, WarehouseInsights } from "../types";
import { absoluteTime, relativeTime } from "./format";

/**
 * The analytic half of `/admin/warehouse` (082): time at the hub, what is on the
 * shelf, what went wrong, and who did the work. Server components; every figure
 * arrives computed from `metrics.ts`.
 */

// ── Time at the hub ─────────────────────────────────────────────────────────

function DurationRow({ label, detail, stats }: { label: string; detail: string; stats: DurationStats }) {
  return (
    <div className="flex flex-col gap-2 rounded-[16px] bg-tm-paper px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] leading-none font-bold text-tm-ink">{label}</span>
        <span className="text-[11.5px] leading-none font-semibold text-tm-text-3">
          {stats.count === 0 ? "nothing to measure" : `${formatCount(stats.count)} measured`}
        </span>
      </div>
      <div className="flex items-end gap-6">
        <div className="flex flex-col gap-1">
          <span className="tm-nums font-display text-[24px] leading-none font-bold tracking-[-0.02em] text-tm-ink">
            {formatDuration(stats.median_hours)}
          </span>
          <span className="text-[11.5px] leading-none font-semibold text-tm-text-3">median</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="tm-nums font-display text-[18px] leading-none font-bold text-tm-text-2">
            {formatDuration(stats.mean_hours)}
          </span>
          <span className="text-[11.5px] leading-none font-semibold text-tm-text-3">average</span>
        </div>
      </div>
      <p className="text-[12px] leading-[1.4] font-medium text-tm-text-3">{detail}</p>
    </div>
  );
}

export function DurationPanel({ insights }: { insights: WarehouseInsights }) {
  return (
    <div className="flex flex-col gap-3">
      <DurationRow
        label="Arrival → shipped"
        detail="From an order's first log-in at the hub to the moment its package left. One sample per order."
        stats={insights.hub_to_ship}
      />
      <DurationRow
        label="Sealed → shipped"
        detail="How long a taped, labelled package sat on the shelf before it went."
        stats={insights.seal_to_ship}
      />
    </div>
  );
}

// ── Packages now ────────────────────────────────────────────────────────────

const STATUS_ROWS = [
  { key: "packing", label: "On the bench", tone: "bg-tm-amber", href: "/warehouse/packages" },
  { key: "sealed", label: "Sealed, waiting", tone: "bg-tm-coral", href: "/warehouse/packages" },
  { key: "shipped", label: "Shipped, all time", tone: "bg-tm-green", href: "/warehouse/packages" },
] as const;

export function PackageStatusPanel({ counts }: { counts: WarehouseInsights["packages_by_status"] }) {
  const max = Math.max(1, counts.packing, counts.sealed, counts.shipped);
  return (
    <ul className="flex flex-col gap-3.5">
      {STATUS_ROWS.map((row) => {
        const value = counts[row.key];
        return (
          <li key={row.key} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <Link href={row.href} className="text-[13px] leading-none font-semibold text-tm-text-2 hover:text-tm-ink">
                {row.label}
              </Link>
              <span className="tm-nums text-[15px] leading-none font-bold text-tm-ink">{formatCount(value)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-tm-paper">
              <div
                className={cn("h-full rounded-full", row.tone)}
                style={{ width: `${value === 0 ? 0 : Math.max(4, (value / max) * 100)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ── Issues ──────────────────────────────────────────────────────────────────

export function IssuesPanel({ issues, now, range }: { issues: IssueSummary; now: Date; range: number }) {
  const nothing =
    issues.held_now === 0 &&
    issues.holds_in_range === 0 &&
    issues.customer_issues_in_range === 0 &&
    issues.customer_issues_open === 0 &&
    issues.failed_lookups === 0;
  if (nothing) {
    return (
      <AdminEmpty
        title="Nothing went wrong"
        body={`No holds, no customer complaints and no failed scans in the last ${range} days.`}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        <IssueFigure label="Held now" value={issues.held_now} tone={issues.held_now > 0 ? "amber" : "muted"} />
        <IssueFigure
          label="Open complaints"
          value={issues.customer_issues_open}
          tone={issues.customer_issues_open > 0 ? "amber" : "muted"}
          href="/warehouse/issues"
        />
        <IssueFigure
          label="Failed scans"
          value={issues.failed_lookups}
          tone={issues.failed_lookups > 0 ? "coral" : "muted"}
          href="/admin/warehouse?kind=failed#activity"
        />
      </div>

      {issues.held.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11.5px] leading-none font-bold text-tm-text-2">On hold</p>
          <ul className="flex flex-col divide-y divide-tm-hairline">
            {issues.held.map((h) => (
              <li key={h.order_id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <Link href={itemHref(h.order_id)} className="tm-nums text-[13px] font-bold text-tm-coral-strong hover:underline">
                    {h.order_no}
                  </Link>
                  <p className="truncate text-[12px] font-medium text-tm-text-2">{h.reason ?? "No reason given"}</p>
                </div>
                <span className="shrink-0 text-[11.5px] font-semibold text-tm-text-3" title={absoluteTime(h.held_at)}>
                  {relativeTime(h.held_at, now)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {issues.hold_reasons.length > 0 ? (
        <TallyList
          title={`Why parcels were held · ${formatCount(issues.holds_in_range)} in ${range} days`}
          rows={issues.hold_reasons.map((r) => ({ label: r.reason, count: r.count }))}
        />
      ) : null}
      {issues.by_verdict.length > 0 ? (
        <TallyList
          title={`What customers reported · ${formatCount(issues.customer_issues_in_range)} in ${range} days`}
          rows={issues.by_verdict.map((r) => ({ label: verdictLabel(r.verdict), count: r.count }))}
        />
      ) : null}
    </div>
  );
}

function IssueFigure({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value: number;
  tone: "amber" | "coral" | "muted";
  href?: string;
}) {
  const body = (
    <>
      <span
        className={cn(
          "tm-nums font-display text-[22px] leading-none font-bold",
          tone === "amber" ? "text-tm-amber" : tone === "coral" ? "text-tm-coral" : "text-tm-text-3",
        )}
      >
        {formatCount(value)}
      </span>
      <span className="text-[11.5px] leading-[1.25] font-semibold text-tm-text-2">{label}</span>
    </>
  );
  const cls = "flex min-w-0 flex-col gap-1.5 rounded-[14px] bg-tm-paper px-3 py-3";
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:bg-tm-tint")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function TallyList({ title, rows }: { title: string; rows: Array<{ label: string; count: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11.5px] leading-none font-bold text-tm-text-2">{title}</p>
      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <li key={row.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
            <span className="truncate text-[12.5px] font-medium text-tm-ink first-letter:uppercase">{row.label}</span>
            <span className="tm-nums text-[12.5px] font-bold text-tm-ink">{formatCount(row.count)}</span>
            <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-tm-paper">
              <div className="h-full rounded-full bg-tm-amber" style={{ width: `${(row.count / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Operators ───────────────────────────────────────────────────────────────

export function OperatorTable({
  operators,
  now,
  actorHref,
}: {
  operators: readonly OperatorRow[];
  now: Date;
  actorHref: (id: string) => string;
}) {
  if (operators.length === 0) {
    return (
      <div className="p-5">
        <AdminEmpty
          title="Nobody has worked the hub in this range"
          body="No operator or admin has logged in, packed, scanned or shipped anything. Widen the range to see earlier shifts."
        />
      </div>
    );
  }
  return (
    <AdminTableScroller>
      <table className="w-full min-w-[720px]">
        <thead>
          <tr>
            <th className={ADMIN_TH}>Person</th>
            <th className={cn(ADMIN_TH, "text-right")}>Actions</th>
            <th className={cn(ADMIN_TH, "text-right")}>Logged in</th>
            <th className={cn(ADMIN_TH, "text-right")}>Shipped</th>
            <th className={cn(ADMIN_TH, "text-right")}>Labels</th>
            <th className={cn(ADMIN_TH, "text-right")}>Scans</th>
            <th className={cn(ADMIN_TH, "text-right")}>Pages</th>
            <th className={ADMIN_TH}>Last active</th>
          </tr>
        </thead>
        <tbody>
          {operators.map((op) => (
            <tr key={op.actor_id} className={ADMIN_TR}>
              <td className={ADMIN_TD}>
                <Link href={actorHref(op.actor_id)} className="group flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold",
                      op.role === "admin"
                        ? "bg-[var(--tm-gradient-avatar)] text-tm-coral-strong"
                        : "bg-[linear-gradient(135deg,#e3f3ea,#d2ecdd)] text-tm-green-ink",
                    )}
                  >
                    {op.initials}
                  </span>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="truncate font-semibold group-hover:underline">{op.name}</span>
                    <AdminBadge tone={op.role === "admin" ? "coral" : "green"} className="w-fit px-2 py-0.5 text-[11px]">
                      {op.role === "admin" ? "Admin" : "Operator"}
                    </AdminBadge>
                  </span>
                </Link>
              </td>
              <td className={cn(ADMIN_TD, "tm-nums text-right font-bold")}>{formatCount(op.actions)}</td>
              <td className={cn(ADMIN_TD, "tm-nums text-right")}>{formatCount(op.received)}</td>
              <td className={cn(ADMIN_TD, "tm-nums text-right")}>{formatCount(op.shipped)}</td>
              <td className={cn(ADMIN_TD, "tm-nums text-right")}>{formatCount(op.labels)}</td>
              <td className={cn(ADMIN_TD, "tm-nums text-right")}>
                {formatCount(op.scans)}
                {op.failed_lookups > 0 ? (
                  <span className="ml-1.5 text-[11.5px] font-semibold text-tm-coral" title="Scans that matched nothing">
                    {formatCount(op.failed_lookups)} failed
                  </span>
                ) : null}
              </td>
              <td className={cn(ADMIN_TD, "tm-nums text-right text-tm-text-2")}>{formatCount(op.page_views)}</td>
              <td className={cn(ADMIN_TD, "whitespace-nowrap text-tm-text-2")}>
                {op.last_active ? (
                  <time dateTime={op.last_active} title={absoluteTime(op.last_active)}>
                    {relativeTime(op.last_active, now)}
                  </time>
                ) : (
                  "–"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminTableScroller>
  );
}
