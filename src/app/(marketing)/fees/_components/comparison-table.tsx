import { CheckCircle } from "@phosphor-icons/react/ssr";

import type { SiteContentRow } from "@/db/queries/site-content";
import { cn } from "@/lib/utils";

/**
 * "Compared with doing it yourself" — design/Tomame - Marketing v2.dc.html
 * #mk-fees.
 *
 * Rows are `site_content` of kind `compare_row`; each row's `data` carries one
 * cell per column key. A real <table> on md+ so the column headers are
 * announced with each cell; a definition list per row on a phone, where a
 * four-column grid is unreadable and horizontal scroll is worse.
 */

interface CompareColumn {
  key: "tomame" | "forwarder" | "traveller";
  label: string;
  /** The Tomame column is the positive one. */
  positive?: boolean;
}

const COLUMNS: readonly CompareColumn[] = [
  { key: "tomame", label: "Tomame", positive: true },
  { key: "forwarder", label: "Dollar card + forwarder" },
  { key: "traveller", label: "“Someone travelling”" },
];

export interface ComparisonTableProps {
  rows: readonly SiteContentRow[];
  className?: string;
}

export function ComparisonTable({ rows, className }: ComparisonTableProps) {
  if (rows.length === 0) return null;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-3xl border border-tm-border bg-card",
        className,
      )}
    >
      {/* Phone: one stacked card per comparison. */}
      <ul className="md:hidden">
        {rows.map((row) => (
          <li
            key={row.id}
            className="border-b border-tm-hairline p-5 last:border-b-0"
          >
            <p className="text-sm font-semibold leading-snug">{row.title}</p>
            <dl className="mt-3 flex flex-col gap-2">
              {COLUMNS.map((column) => (
                <div key={column.key} className="flex flex-col gap-0.5">
                  <dt className="text-[11px] font-semibold uppercase leading-none tracking-[0.08em] text-tm-text-3">
                    {column.label}
                  </dt>
                  <dd
                    className={cn(
                      "flex items-center gap-2 text-sm leading-snug",
                      column.positive
                        ? "font-medium text-tm-green-ink"
                        : "text-tm-text-2",
                    )}
                  >
                    {column.positive ? (
                      <CheckCircle
                        weight="fill"
                        className="size-4 shrink-0 text-tm-green"
                        aria-hidden="true"
                      />
                    ) : null}
                    {cell(row, column.key)}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>

      {/* md+: the design's four-column table. */}
      <table className="hidden w-full border-collapse text-left md:table">
        <thead>
          <tr className="bg-tm-paper">
            <th scope="col" className="w-[26%] px-6 py-4">
              <span className="sr-only">Comparison</span>
            </th>
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                scope="col"
                className="px-3 py-4 text-xs font-semibold uppercase leading-none tracking-[0.08em] text-tm-text-3"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-tm-hairline">
              <th
                scope="row"
                className="px-6 py-4.5 text-sm font-semibold leading-snug"
              >
                {row.title}
              </th>
              {COLUMNS.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "px-3 py-4.5 align-middle text-sm leading-snug",
                    column.positive
                      ? "font-medium text-tm-green-ink"
                      : "text-tm-text-2",
                  )}
                >
                  <span className="flex items-center gap-2">
                    {column.positive ? (
                      <CheckCircle
                        weight="fill"
                        className="size-4.5 shrink-0 text-tm-green"
                        aria-hidden="true"
                      />
                    ) : null}
                    {cell(row, column.key)}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** `site_content.data` is free-form JSONB — anything missing renders as an em dash. */
function cell(row: SiteContentRow, key: CompareColumn["key"]): string {
  const value = row.data[key];
  return typeof value === "string" && value.length > 0 ? value : "—";
}
