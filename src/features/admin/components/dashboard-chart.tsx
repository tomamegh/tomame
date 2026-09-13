"use client";

import { useMemo, useState } from "react";
import { useReducedMotion } from "motion/react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DashboardSeriesPoint } from "@/features/admin/admin.service";
import { cn } from "@/lib/utils";
import { formatCount, formatDayKey, formatGhs } from "./dashboard-format";

/**
 * The 30-day trend, as one chart with three things it can plot.
 *
 * WHY ONE CHART AND NOT THREE. Orders, settled money and pastes move together
 * or they do not, and that comparison is the whole point of looking. Three
 * stacked cards would take three times the height to say the same thing and
 * make the shapes harder to compare, because each would scale to its own axis.
 *
 * WHAT CHANGED. The old chart was stone/slate on `--chart-1..5`, which are
 * still the shadcn starter's blues and belong to no part of this brand; its
 * "Revenue" series plotted order totals including orders nobody had paid for;
 * and a day with no rows simply had no point, so recharts joined straight
 * across it and a dead weekend drew as steady trade. The series arrives
 * zero-filled from the service now, the colours are the brand's own, and
 * "Settled" is money `payments` says actually arrived.
 *
 * The client boundary stops here: the page is a server component and hands this
 * island a finished array. Nothing is fetched, computed or priced in the
 * browser.
 */

/**
 * The brand accents, as literals.
 *
 * Recharts writes these into SVG `stroke`/`fill` attributes, which accept a
 * `var()` perfectly well — so these are the published chart tokens rather than
 * copies of them. `--chart-1..5` used to be the shadcn starter's five shades of
 * cornflower, a palette that appears nowhere else in Tomame; they are now bound
 * to the brand's own colours in `globals.css`, which is why this file can name
 * them instead of duplicating hexes that would drift the first time the brand
 * moved.
 */
const SERIES_COLOURS = {
  coral: "var(--chart-1)", // → --tm-coral
  green: "var(--chart-2)", // → --tm-green
  amber: "var(--chart-3)", // → --tm-amber
} as const;

type MetricKey = "orders" | "revenueGhs" | "pastes";

interface Metric {
  key: MetricKey;
  label: string;
  colour: string;
  /** Y-axis ticks: short, because the axis is 48px wide. */
  axis: (value: number) => string;
  /** The tooltip's full sentence. */
  readout: (value: number) => string;
}

const METRICS: readonly Metric[] = [
  {
    key: "orders",
    label: "Orders",
    colour: SERIES_COLOURS.coral,
    axis: (value) => formatCount(value),
    readout: (value) => `${formatCount(value)} ${value === 1 ? "order" : "orders"}`,
  },
  {
    key: "revenueGhs",
    label: "Settled",
    colour: SERIES_COLOURS.green,
    // Thousands are abbreviated on the axis only. The tooltip keeps every
    // pesewa, because that is the figure an admin would reconcile against.
    axis: (value) =>
      value >= 1000 ? `₵${(value / 1000).toFixed(1)}k` : `₵${Math.round(value)}`,
    readout: (value) => formatGhs(value),
  },
  {
    key: "pastes",
    label: "Pastes",
    colour: SERIES_COLOURS.amber,
    axis: (value) => formatCount(value),
    readout: (value) => `${formatCount(value)} ${value === 1 ? "paste" : "pastes"}`,
  },
];

export function DashboardChart({ series }: { series: readonly DashboardSeriesPoint[] }) {
  const [active, setActive] = useState<MetricKey>("orders");
  const reducedMotion = useReducedMotion();

  const metric = useMemo(
    () => METRICS.find((option) => option.key === active) ?? METRICS[0]!,
    [active],
  );

  // Recharts mutates nothing, but it does want a plain array; the service hands
  // over a readonly one.
  const data = useMemo(() => [...series], [series]);

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Chart series" className="flex flex-wrap gap-1.5">
        {METRICS.map((option) => {
          const selected = option.key === metric.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => setActive(option.key)}
              aria-pressed={selected}
              className={cn(
                "rounded-full px-3 py-1.5 text-[12px] leading-none font-semibold transition-colors",
                "focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none",
                selected
                  ? "bg-tm-ink text-white"
                  : "bg-tm-paper text-tm-text-2 hover:bg-tm-tint hover:text-tm-ink",
              )}
            >
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: option.colour }}
                />
                {option.label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 6, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="admin-dashboard-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={metric.colour} stopOpacity={0.22} />
                <stop offset="100%" stopColor={metric.colour} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#ece7e2" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={28}
              tick={{ fontSize: 11, fill: "#8c8279" }}
              tickFormatter={formatDayKey}
            />
            <YAxis
              width={52}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "#8c8279" }}
              tickFormatter={metric.axis}
            />
            <Tooltip
              cursor={{ stroke: "#ded7d0", strokeWidth: 1 }}
              content={({ active: hovering, payload, label }) =>
                hovering && payload?.length ? (
                  <ChartReadout
                    day={typeof label === "string" ? label : ""}
                    value={Number(payload[0]?.value ?? 0)}
                    metric={metric}
                  />
                ) : null
              }
            />
            <Area
              type="monotone"
              dataKey={metric.key}
              stroke={metric.colour}
              strokeWidth={2}
              fill="url(#admin-dashboard-fill)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: metric.colour }}
              isAnimationActive={!reducedMotion}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ChartReadout({
  day,
  value,
  metric,
}: {
  day: string;
  value: number;
  metric: Metric;
}) {
  return (
    <div className="rounded-[12px] border border-tm-border bg-card px-3 py-2 shadow-sm">
      <p className="text-[11px] leading-none font-semibold text-tm-text-3">
        {day ? formatDayKey(day) : ""}
      </p>
      <p className="tm-nums mt-1.5 text-[13px] leading-none font-bold text-tm-ink">
        {metric.readout(value)}
      </p>
    </div>
  );
}
