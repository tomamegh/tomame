"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { ChartDataPoint, ChartMetric } from "../types";

// ── Config ────────────────────────────────────────────────────────────────────

const DEFAULT_METRIC: ChartMetric = "orders";
const DEFAULT_TIME_RANGE = "30";

type MetricOption = {
  value: ChartMetric;
  label: string;
  description: string;
  color: string;
  dataKey: keyof ChartDataPoint;
  yFormatter: (v: number) => string;
  tooltipFormatter: (v: number) => string;
};

const METRIC_OPTIONS: MetricOption[] = [
  {
    value: "orders",
    label: "Orders",
    description: "Total orders placed",
    color: "#f43f5e",
    dataKey: "orders",
    yFormatter: (v) => String(v),
    tooltipFormatter: (v) => `${v} order${v !== 1 ? "s" : ""}`,
  },
  {
    value: "revenue",
    label: "Revenue",
    description: "Total revenue collected (GHS)",
    color: "#10b981",
    dataKey: "revenueGhs",
    yFormatter: (v) =>
      v >= 1000 ? `₵${(v / 1000).toFixed(1)}K` : `₵${v.toFixed(0)}`,
    tooltipFormatter: (v) =>
      `GH₵ ${v.toLocaleString("en-GH", { minimumFractionDigits: 2 })}`,
  },
  {
    value: "users",
    label: "Active Users",
    description: "Unique users with activity",
    color: "#3b82f6",
    dataKey: "users",
    yFormatter: (v) => String(v),
    tooltipFormatter: (v) => `${v} user${v !== 1 ? "s" : ""}`,
  },
  {
    value: "transactions",
    label: "Transactions",
    description: "Successful payments processed",
    color: "#8b5cf6",
    dataKey: "transactions",
    yFormatter: (v) => String(v),
    tooltipFormatter: (v) => `${v} transaction${v !== 1 ? "s" : ""}`,
  },
  {
    value: "deliveries",
    label: "Deliveries",
    description: "New shipments started",
    color: "#f59e0b",
    dataKey: "deliveries",
    yFormatter: (v) => String(v),
    tooltipFormatter: (v) => `${v} deliver${v !== 1 ? "ies" : "y"}`,
  },
];

const TIME_RANGE_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
];

// Build a stable ChartConfig so ChartContainer always has all keys defined
const chartConfig: ChartConfig = Object.fromEntries(
  METRIC_OPTIONS.map((m) => [m.dataKey, { label: m.label, color: m.color }]),
);

// ── Tooltip ───────────────────────────────────────────────────────────────────

function CustomTooltip({
  active,
  payload,
  label,
  metric,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  metric: MetricOption;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value ?? 0;
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-3 py-2 shadow-md text-xs">
      <p className="text-stone-400 mb-1">
        {label
          ? new Date(label).toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })
          : ""}
      </p>
      <div className="flex items-center gap-2">
        <span
          className="inline-block w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: metric.color }}
        />
        <span className="font-semibold text-stone-800">
          {metric.tooltipFormatter(value)}
        </span>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface OverviewChartProps {
  data?: ChartDataPoint[];
  isLoading?: boolean;
}

export function OverviewChart({ data = [], isLoading = false }: OverviewChartProps) {
  const isMobile = useIsMobile();
  const [metric, setMetric] = React.useState<ChartMetric>(DEFAULT_METRIC);
  const [timeRange, setTimeRange] = React.useState(DEFAULT_TIME_RANGE);

  // Default to 7-day view on mobile
  React.useEffect(() => {
    if (isMobile) setTimeRange("7");
  }, [isMobile]);

  const activeMetric = METRIC_OPTIONS.find((m) => m.value === metric)!;

  const filteredData = React.useMemo(() => {
    const days = parseInt(timeRange, 10);
    return data.slice(-days);
  }, [data, timeRange]);

  const timeRangeLabel =
    TIME_RANGE_OPTIONS.find((o) => o.value === timeRange)?.label ?? "";

  function handleMetricChange(value: string) {
    setMetric(value as ChartMetric);
    // Reset time range to default when switching metrics
    setTimeRange(isMobile ? "7" : DEFAULT_TIME_RANGE);
  }

  return (
    <Card className="@container/card soft-shadow border-none">
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{activeMetric.label}</CardTitle>
          <CardDescription>
            <span className="hidden @[540px]/card:block">
              {activeMetric.description} &middot; {timeRangeLabel}
            </span>
            <span className="@[540px]/card:hidden">{timeRangeLabel}</span>
          </CardDescription>
        </div>
        <CardAction>
          <div className="flex flex-wrap gap-2 justify-end">
            <Select value={metric} onValueChange={handleMetricChange}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue placeholder="Select graph" />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectGroup>
                  {METRIC_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectGroup>
                  {TIME_RANGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {isLoading ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
            <AreaChart
              data={filteredData}
              margin={{ top: 4, right: 8, left: -8, bottom: 0 }}
            >
              <defs>
                <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor={activeMetric.color}
                    stopOpacity={0.25}
                  />
                  <stop
                    offset="95%"
                    stopColor={activeMetric.color}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                stroke="#f5f5f4"
              />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                tick={{ fontSize: 11, fill: "#a8a29e" }}
                tickFormatter={(value) =>
                  new Date(value).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })
                }
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#a8a29e" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={activeMetric.yFormatter}
                width={48}
              />
              <Tooltip
                cursor={false}
                content={({ active, payload, label }) => (
                  <CustomTooltip
                    active={active}
                    payload={payload as Array<{ value: number }>}
                    label={label as string | undefined}
                    metric={activeMetric}
                  />
                )}
              />
              <Area
                key={activeMetric.dataKey}
                type="monotone"
                dataKey={activeMetric.dataKey}
                stroke={activeMetric.color}
                strokeWidth={2}
                fill="url(#chart-fill)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: activeMetric.color }}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
