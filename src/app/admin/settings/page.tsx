import { PricingConfigCard } from "@/features/settings/components/pricing-config-card";
import { ExchangeRatesCard } from "@/features/settings/components/exchange-rates-card";

export default function SettingsPage() {
  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-stone-800">Settings</h1>
        <p className="text-sm text-stone-500 mt-0.5">
          Manage pricing configuration and exchange rates.
        </p>
      </div>

      <ExchangeRatesCard />
      <PricingConfigCard />
    </div>
  );
}
