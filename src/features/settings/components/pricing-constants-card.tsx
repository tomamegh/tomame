"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { usePricingConstants, useUpdatePricingConstant } from "../hooks/useSettings";
import type { PricingConstant } from "@/features/pricing/types";

/** Human-friendly labels and formatting for each constant */
const CONSTANT_META: Record<string, { label: string; prefix?: string; suffix?: string; step: string; description: string }> = {
  freight_rate_per_lb: {
    label: "Freight Rate (per lb)",
    prefix: "$",
    step: "0.01",
    description: "International freight cost per lb in USD. This is multiplied by the chargeable weight.",
  },
  handling_fee_usd: {
    label: "Handling Fee",
    prefix: "$",
    step: "0.01",
    description: "Flat fee per order covering warehouse handling, repackaging, and documentation.",
  },
  fx_buffer_pct: {
    label: "FX Buffer",
    suffix: "%",
    step: "0.01",
    description: "Buffer added on top of mid-market rate to protect against intraday FX movements.",
  },
  minimum_tax_usd: {
    label: "Minimum Tax",
    prefix: "$",
    step: "0.01",
    description: "Minimum tax charged per order. If the calculated tax (%) is below this amount, this minimum is applied instead.",
  },
  volumetric_divisor: {
    label: "Volumetric Divisor",
    step: "1",
    description: "Divisor used to calculate volumetric weight from dimensions in inches (L × W × H ÷ this value).",
  },
};

function ConstantRow({ constant }: { constant: PricingConstant }) {
  const meta = CONSTANT_META[constant.key];
  const update = useUpdatePricingConstant();

  // For fx_buffer_pct, display as percentage (0.04 → 4)
  const isPercent = constant.key === "fx_buffer_pct";
  const displayValue = isPercent ? constant.value * 100 : constant.value;

  const [value, setValue] = useState(String(displayValue));

  useEffect(() => {
    setValue(String(isPercent ? constant.value * 100 : constant.value));
  }, [constant.value, isPercent]);

  const isDirty = parseFloat(value) !== displayValue;

  function handleSave() {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed < 0) {
      toast.error("Value must be a non-negative number");
      return;
    }

    const dbValue = isPercent ? parsed / 100 : parsed;

    update.mutate(
      { key: constant.key, value: dbValue },
      {
        onSuccess: () => toast.success(`${meta?.label ?? constant.key} updated`),
        onError: (err) => toast.error(err.message),
      },
    );
  }

  if (!meta) return null;

  return (
    <div className="flex flex-col sm:flex-row sm:items-end gap-3 py-4 border-b border-stone-100 last:border-0">
      <div className="flex-1 space-y-1.5">
        <Label htmlFor={`const-${constant.key}`}>{meta.label}</Label>
        <div className="relative">
          {meta.prefix && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">
              {meta.prefix}
            </span>
          )}
          <Input
            id={`const-${constant.key}`}
            type="number"
            step={meta.step}
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={meta.prefix ? "pl-6" : meta.suffix ? "pr-6" : ""}
          />
          {meta.suffix && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">
              {meta.suffix}
            </span>
          )}
        </div>
        <p className="text-xs text-stone-400">{meta.description}</p>
      </div>
      <Button
        onClick={handleSave}
        disabled={update.isPending || !isDirty}
        size="sm"
        className="gap-1.5 shrink-0"
      >
        {update.isPending && <Spinner className="size-3.5" />}
        {update.isPending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

export function PricingConstantsCard() {
  const { data: constants, isLoading } = usePricingConstants();

  // Order: freight, handling, fx_buffer, volumetric
  const orderedKeys = ["freight_rate_per_lb", "handling_fee_usd", "minimum_tax_usd", "fx_buffer_pct", "volumetric_divisor"];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pricing Constants</CardTitle>
        <CardDescription>
          Adjust freight rate, handling fee, and other formula-based pricing parameters.
          Changes take effect immediately on new orders.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 text-stone-400 text-sm h-24">
            <Spinner className="size-4" />
            <span>Loading…</span>
          </div>
        ) : !constants?.length ? (
          <p className="text-sm text-stone-400 text-center py-6">No pricing constants found.</p>
        ) : (
          <div>
            {orderedKeys.map((key) => {
              const c = constants.find((item) => item.key === key);
              return c ? <ConstantRow key={c.key} constant={c} /> : null;
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
