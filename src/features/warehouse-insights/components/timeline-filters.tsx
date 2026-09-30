import Link from "next/link";

import { cn } from "@/lib/utils";

import { KIND_GROUPS, type TimelineFilters } from "../filters";
import type { StaffMember } from "../types";

/**
 * The timeline's filters (082) — a plain GET form, so a filtered view is a URL
 * and the page stays a server component. The insights range rides along as a
 * hidden field; the cursor does not, because a new filter starts at the top.
 */

const FIELD =
  "h-9 w-full min-w-0 rounded-full border border-tm-border bg-card px-3.5 text-[13px] font-medium text-tm-ink placeholder:text-tm-text-3 focus:border-tm-coral/40 focus:outline-none";
const LABEL = "text-[11.5px] leading-none font-bold text-tm-text-2";

export function TimelineFiltersForm({
  filters,
  staff,
  range,
  clearHref,
}: {
  filters: TimelineFilters;
  staff: readonly StaffMember[];
  range: number;
  clearHref: string;
}) {
  const active =
    filters.actor || filters.kind.value !== "work" || filters.from || filters.to || filters.qRaw;
  const sorted = [...staff].sort(
    (a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "warehouse" ? -1 : 1),
  );

  return (
    <form
      action="/admin/warehouse#activity"
      method="get"
      className="grid grid-cols-1 gap-3 border-b border-tm-hairline px-5 py-4 sm:grid-cols-2 lg:grid-cols-[1.1fr_1fr_0.8fr_0.8fr_1fr_auto]"
    >
      <input type="hidden" name="range" value={String(range)} />
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={LABEL}>Who</span>
        <select name="actor" defaultValue={filters.actor ?? ""} className={FIELD}>
          <option value="">Everyone</option>
          {sorted.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name} · {person.role === "admin" ? "Admin" : "Operator"}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={LABEL}>What</span>
        <select name="kind" defaultValue={filters.kind.value} className={FIELD}>
          {KIND_GROUPS.map((group) => (
            <option key={group.value} value={group.value}>
              {group.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={LABEL}>From</span>
        <input type="date" name="from" defaultValue={filters.from ?? ""} className={FIELD} />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={LABEL}>To</span>
        <input type="date" name="to" defaultValue={filters.to ?? ""} className={FIELD} />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={LABEL}>Reference</span>
        <input
          type="search"
          name="q"
          defaultValue={filters.qRaw}
          placeholder="PKG-10001 or TM-00005"
          className={cn(FIELD, filters.qRaw && !filters.q && "border-tm-amber/60")}
          aria-describedby={filters.qRaw && !filters.q ? "timeline-q-hint" : undefined}
        />
      </label>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
        <button
          type="submit"
          className="tm-cta-gradient inline-flex h-9 flex-1 items-center justify-center rounded-full px-4 text-[13px] leading-none font-semibold text-white lg:flex-none"
        >
          Apply
        </button>
        {active ? (
          <Link
            href={clearHref}
            className="inline-flex h-9 items-center justify-center rounded-full border border-tm-border px-3.5 text-[12.5px] font-semibold text-tm-text-2 transition-colors hover:text-tm-ink"
          >
            Clear
          </Link>
        ) : null}
      </div>
      {filters.qRaw && !filters.q ? (
        <p id="timeline-q-hint" className="text-[12px] font-medium text-tm-amber sm:col-span-2 lg:col-span-6">
          “{filters.qRaw}” is not a package or order reference, so it was ignored. Try PKG-10001 or TM-00005.
        </p>
      ) : null}
    </form>
  );
}
