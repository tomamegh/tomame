"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ChartDataPoint, ChartMetric } from "../types";

const METRICS: {
  key: ChartMetric;
  label: string;
  dataKey: string;
  stroke: string;
}[] = [
  { key: "orders", label: "Orders", dataKey: "orders", stroke: "#f43f5e" },
  { key: "revenue", label: "Revenue", dataKey: "revenueGhs", stroke: "#10b981" },
  { key: "users", label: "Users", dataKey: "users", stroke: "#3b82f6" },
];

function formatAxisDate(dateStr: string) {
  const parts = dateStr.split("-");
  const month = parseInt(parts[1] ?? "1", 10);
  const day = parseInt(parts[2] ?? "1", 10);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[month - 1]} ${day}`;
}

function formatValue(metric: ChartMetric, value: number) {
  if (metric === "revenue") {
    return `GHS ${value.toLocaleString("en-GH", { minimumFractionDigits: 2 })}`;
  }
  return value.toString();
}

function ChartTooltip({
  active,
  payload,
  label,
  metric,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  metric: ChartMetric;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value ?? 0;
  const activeMetric = METRICS.find((m) => m.key === metric)!;
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-3 py-2 shadow-md text-xs">
      <p className="text-stone-400 mb-1">{formatAxisDate(label ?? "")}</p>
      <p className="font-semibold text-stone-800">
        {activeMetric.label}: {formatValue(metric, value)}
      </p>
    </div>
  );
}

interface OverviewChartProps {
  title:string;
  data?: ChartDataPoint[];
  isLoading: boolean;
}

export function OverviewChart({ data, isLoading, title }: OverviewChartProps) {
  const [metric, setMetric] = useState<ChartMetric>("orders");
  const active = METRICS.find((m) => m.key === metric)!;

  return (
    <Card className="soft-shadow border-none">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle>{title} — Last 30 Days</CardTitle>
          <div className="flex gap-1 bg-stone-100 rounded-lg p-1">
            {METRICS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  metric === m.key
                    ? "bg-white text-stone-800 shadow-sm"
                    : "text-stone-500 hover:text-stone-700"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart
              data={data}
              margin={{ top: 4, right: 8, left: -8, bottom: 0 }}
            >
              <defs>
                {METRICS.map((m) => (
                  <linearGradient
                    key={m.key}
                    id={`gradient-${m.key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor={m.stroke} stopOpacity={0.18} />
                    <stop offset="95%" stopColor={m.stroke} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatAxisDate}
                tick={{ fontSize: 11, fill: "#a8a29e" }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#a8a29e" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) =>
                  metric === "revenue" ? `₵${v}` : String(v)
                }
              />
              <Tooltip
                content={({ active, payload, label }) => (
                  <ChartTooltip
                    active={active}
                    payload={payload as Array<{ value: number }>}
                    label={label as string | undefined}
                    metric={metric}
                  />
                )}
              />
              <Area
                type="monotone"
                dataKey={active.dataKey}
                stroke={active.stroke}
                strokeWidth={2}
                fill={`url(#gradient-${metric})`}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: active.stroke }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
