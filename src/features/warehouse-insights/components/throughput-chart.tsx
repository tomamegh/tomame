"use client";

import { useMemo } from "react";
import { useReducedMotion } from "motion/react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatCount, formatDayKey } from "@/features/admin/components/dashboard-format";

import type { ThroughputDay } from "../types";

/**
 * Items logged in vs orders shipped, per day (082).
 *
 * Bars, not lines: these are counts of discrete parcels, and a line between a
 * Tuesday of 4 and a Wednesday of 0 draws a Tuesday-evening 2 that never
 * happened. Coral for what came in (the brand's lead series), green for what
 * left — green is "settled" everywhere else in the admin.
 *
 * The page hands over a finished, zero-filled array; nothing is computed here.
 */

const SERIES = [
  { key: "received", label: "Logged in", colour: "var(--chart-1)" },
  { key: "shipped", label: "Shipped", colour: "var(--chart-2)" },
] as const;

export function ThroughputChart({ days }: { days: readonly ThroughputDay[] }) {
  const reducedMotion = useReducedMotion();
  const data = useMemo(() => [...days], [days]);
  const dense = days.length > 31;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4" aria-hidden>
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-[12px] leading-none font-semibold text-tm-text-2">
            <span className="inline-block size-2.5 rounded-[3px]" style={{ backgroundColor: s.colour }} />
            {s.label}
          </span>
        ))}
      </div>
      <div
        className="h-[230px] w-full"
        role="img"
        aria-label={`Items logged in and orders shipped per day, ${days.length} days`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 4, left: -18, bottom: 0 }} barGap={dense ? 0 : 2}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#ece7e2" />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              tick={{ fontSize: 11, fill: "#8c8279" }}
              tickFormatter={formatDayKey}
            />
            <YAxis
              width={44}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "#8c8279" }}
            />
            <Tooltip
              cursor={{ fill: "rgba(242, 91, 61, 0.06)" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="rounded-[12px] border border-tm-border bg-card px-3 py-2 shadow-sm">
                    <p className="text-[11px] leading-none font-semibold text-tm-text-3">
                      {typeof label === "string" ? formatDayKey(label) : ""}
                    </p>
                    {SERIES.map((s) => {
                      const value = Number(payload.find((p) => p.dataKey === s.key)?.value ?? 0);
                      return (
                        <p key={s.key} className="tm-nums mt-1.5 flex items-center gap-1.5 text-[13px] leading-none font-bold text-tm-ink">
                          <span className="inline-block size-2 rounded-full" style={{ backgroundColor: s.colour }} />
                          {formatCount(value)} {s.label.toLowerCase()}
                        </p>
                      );
                    })}
                  </div>
                ) : null
              }
            />
            {SERIES.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                fill={s.colour}
                radius={[4, 4, 0, 0]}
                maxBarSize={18}
                isAnimationActive={!reducedMotion}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
