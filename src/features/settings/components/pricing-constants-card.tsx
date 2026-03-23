"use client";

import { useState } from "react";
import { SaveIcon, PencilIcon, XIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { apiFetch } from "@/lib/auth/api-helpers";
import { useQueryClient } from "@tanstack/react-query";
import {
  usePricingConstants,
  settingsKeys,
  type PricingConstant,
} from "../hooks/useSettings";

/** Format a value for display based on its unit */
function formatDisplay(value: number, unit: string): string {
  if (unit === "%") return `${(value * 100).toFixed(1)}%`;
  if (unit === "$/lb") return `$${value.toFixed(2)}/lb`;
  if (unit === "$") return `$${value.toFixed(2)}`;
  return value.toString();
}

/** Convert stored value to input value (% stored as 0.10 → display as 10) */
function toInputValue(value: number, unit: string): string {
  if (unit === "%") return (value * 100).toString();
  return value.toString();
}

/** Convert input value back to stored value (10 → 0.10 for %) */
function fromInputValue(input: string, unit: string): number {
  const num = parseFloat(input);
  if (isNaN(num)) return 0;
  if (unit === "%") return num / 100;
  return num;
}

// Group constants for organized display
const GROUPS: { title: string; keys: string[] }[] = [
  {
    title: "Shipping & Handling",
    keys: ["freight_rate_per_lb", "handling_fee_usd"],
  },
  {
    title: "Tax & Fees",
    keys: ["minimum_tax_usd", "fx_buffer_pct"],
  },
  {
    title: "Regional Tax Tiers",
    keys: ["tax_pct_usa", "tax_pct_uk", "tax_pct_china"],
  },
];

function ConstantRow({
  constant,
  onSaved,
}: {
  constant: PricingConstant;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(
    toInputValue(constant.value, constant.unit),
  );
  const [saving, setSaving] = useState(false);

  function handleEdit() {
    setInputVal(toInputValue(constant.value, constant.unit));
    setEditing(true);
  }

  function handleCancel() {
    setEditing(false);
    setInputVal(toInputValue(constant.value, constant.unit));
  }

  async function handleSave() {
    const newValue = fromInputValue(inputVal, constant.unit);
    if (newValue === constant.value) {
      setEditing(false);
      return;
    }
    if (newValue < 0) {
      toast.error("Value cannot be negative");
      return;
    }

    setSaving(true);
    try {
      await apiFetch("/api/admin/pricing-constants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: constant.key, value: newValue }),
      });
      toast.success(`${constant.label} updated`);
      setEditing(false);
      onSaved();
    } catch {
      toast.error(`Failed to update ${constant.label}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center justify-between py-3 gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-stone-800">{constant.label}</p>
        <p className="text-xs text-stone-400 truncate">{constant.description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {editing ? (
          <>
            <div className="relative">
              <Input
                type="number"
                step="any"
                min="0"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                className="w-24 h-8 text-sm pr-7 font-mono"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") handleCancel();
                }}
                autoFocus
                disabled={saving}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-stone-400 pointer-events-none">
                {constant.unit === "%" ? "%" : constant.unit === "$/lb" ? "/lb" : ""}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <Spinner className="size-3.5" />
              ) : (
                <SaveIcon className="size-3.5 text-green-600" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={handleCancel}
              disabled={saving}
            >
              <XIcon className="size-3.5 text-stone-400" />
            </Button>
          </>
        ) : (
          <>
            <span className="font-mono text-sm font-semibold text-stone-800">
              {formatDisplay(constant.value, constant.unit)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={handleEdit}
            >
              <PencilIcon className="size-3.5 text-stone-400" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function PricingConstantsCard() {
  const { data: constants, isLoading } = usePricingConstants();
  const queryClient = useQueryClient();

  function handleSaved() {
    queryClient.invalidateQueries({
      queryKey: settingsKeys.pricingConstants,
    });
  }

  const constantsByKey = new Map(constants?.map((c) => [c.key, c]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pricing Constants</CardTitle>
        <CardDescription>
          Manage freight rates, fees, tax tiers, and FX buffer. Changes take
          effect immediately for new orders.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 text-stone-400 text-sm h-24">
            <Spinner className="size-4" />
            <span>Loading...</span>
          </div>
        ) : !constants?.length ? (
          <p className="text-sm text-stone-400 text-center py-6">
            No pricing constants configured.
          </p>
        ) : (
          <div className="space-y-6">
            {GROUPS.map((group) => {
              const items = group.keys
                .map((k) => constantsByKey.get(k))
                .filter(Boolean) as PricingConstant[];
              if (!items.length) return null;
              return (
                <div key={group.title}>
                  <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1">
                    {group.title}
                  </h3>
                  <div className="divide-y divide-stone-100">
                    {items.map((c) => (
                      <ConstantRow
                        key={c.id}
                        constant={c}
                        onSaved={handleSaved}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
