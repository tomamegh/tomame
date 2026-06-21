import { ExchangeRatesCard } from "@/features/settings/components/exchange-rates-card";
import { PricingConstantsCard } from "@/features/settings/components/pricing-constants-card";
import { PricingGroupsCard } from "@/features/pricing/components/pricing-groups-card";
import { CategoryMappingsCard } from "@/features/pricing/components/category-mappings-card";
import { ImportExportCard } from "@/features/pricing/components/import-export-controls";

export default function SettingsPage() {
  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-stone-800">Settings</h1>
        <p className="text-sm text-stone-500 mt-1">
          Manage pricing configuration, exchange rates, and category mappings.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ExchangeRatesCard />
        <PricingConstantsCard />
      </div>

      <PricingGroupsCard />

      <CategoryMappingsCard />

      <ImportExportCard />
    </div>
  );
}
