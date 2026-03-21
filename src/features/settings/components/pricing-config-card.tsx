"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePricingConfig, useUpdatePricingConfig } from "../hooks/useSettings";
import type { PricingConfigResponse } from "@/features/pricing/types";

const REGIONS = ["USA", "UK", "CHINA"] as const;
const REGION_FLAGS: Record<string, string> = { USA: "🇺🇸", UK: "🇬🇧", CHINA: "🇨🇳" };

interface RegionFormProps {
  config: PricingConfigResponse;
}

function RegionForm({ config }: RegionFormProps) {
  const update = useUpdatePricingConfig();

  const [shippingFee, setShippingFee] = useState(String(config.base_shipping_fee_usd));
  const [serviceFee, setServiceFee] = useState(
    String((config.service_fee_percentage * 100).toFixed(2)),
  );

  useEffect(() => {
    setShippingFee(String(config.base_shipping_fee_usd));
    setServiceFee(String((config.service_fee_percentage * 100).toFixed(2)));
  }, [config]);

  function handleSave() {
    const baseShippingFeeUsd = parseFloat(shippingFee);
    const serviceFeePercentage = parseFloat(serviceFee) / 100;

    if (isNaN(baseShippingFeeUsd) || baseShippingFeeUsd <= 0) {
      toast.error("Base shipping fee must be a positive number");
      return;
    }
    if (isNaN(serviceFeePercentage) || serviceFeePercentage < 0 || serviceFeePercentage > 1) {
      toast.error("Tax must be between 0% and 100%");
      return;
    }

    update.mutate(
      {
        region: config.region as "USA" | "UK" | "CHINA",
        baseShippingFeeUsd,
        serviceFeePercentage,
      },
      {
        onSuccess: () => toast.success(`${config.region} pricing updated`),
        onError: (err) => toast.error(err.message),
      },
    );
  }

  const isDirty =
    parseFloat(shippingFee) !== config.base_shipping_fee_usd ||
    parseFloat(serviceFee) / 100 !== config.service_fee_percentage;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor={`shipping-${config.region}`}>Base Shipping Fee (USD)</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">
              $
            </span>
            <Input
              id={`shipping-${config.region}`}
              type="number"
              step="0.01"
              min="0.01"
              value={shippingFee}
              onChange={(e) => setShippingFee(e.target.value)}
              className="pl-6"
            />
          </div>
          <p className="text-xs text-stone-400">
            Flat international freight charge added to all formula-based orders.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`service-fee-${config.region}`}>Tax (%)</Label>
          <div className="relative">
            <Input
              id={`service-fee-${config.region}`}
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={serviceFee}
              onChange={(e) => setServiceFee(e.target.value)}
              className="pr-6"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">
              %
            </span>
          </div>
          <p className="text-xs text-stone-400">
            Tax rate applied to formula-based orders for this region (e.g. 15 = 15%). Minimum tax from Pricing Constants is enforced.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-stone-100">
        <p className="text-xs text-stone-400">
          Last updated:{" "}
          {new Date(config.last_updated).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </p>
        <Button
          onClick={handleSave}
          disabled={update.isPending || !isDirty}
          size="sm"
          className="gap-1.5"
        >
          {update.isPending && <Spinner className="size-3.5" />}
          {update.isPending ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}

export function PricingConfigCard() {
  const { data, isLoading } = usePricingConfig();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pricing Configuration</CardTitle>
        <CardDescription>
          Set the base shipping fee and tax percentage per region.
          Exchange rates are pulled live from the exchange rates table.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 text-stone-400 text-sm h-24">
            <Spinner className="size-4" />
            <span>Loading…</span>
          </div>
        ) : !data?.configs.length ? (
          <p className="text-sm text-stone-400 text-center py-6">No pricing configs found.</p>
        ) : (
          <Tabs defaultValue="USA">
            <TabsList className="mb-4">
              {REGIONS.map((region) => (
                <TabsTrigger key={region} value={region} className="gap-1.5">
                  <span>{REGION_FLAGS[region]}</span>
                  {region}
                </TabsTrigger>
              ))}
            </TabsList>
            {REGIONS.map((region) => {
              const config = data.configs.find((c) => c.region === region);
              return (
                <TabsContent key={region} value={region}>
                  {config ? (
                    <RegionForm config={config} />
                  ) : (
                    <p className="text-sm text-stone-400 py-4">
                      No config found for {region}.
                    </p>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
