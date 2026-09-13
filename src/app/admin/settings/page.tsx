import type { Metadata } from "next";

import { AdminCard, AdminPage } from "@/components/layout/admin";
import {
  listCategoryMappings,
  listPricingConstants,
  listPricingGroupsWithCounts,
} from "@/db/queries/admin-money";
import { getFeesWorkedExample } from "@/features/marketing/services/worked-example.service";
import type { WorkedExample } from "@/features/marketing/types";
import { AdminCategoryMappings } from "@/features/pricing/components/admin-category-mappings";
import { AdminPricingGroups } from "@/features/pricing/components/admin-pricing-groups";
import { AdminPricingTransfer } from "@/features/pricing/components/admin-pricing-transfer";
import { collectMissingConstants } from "@/features/pricing/services/pricing-constant-keys";
import { AdminExchangeRatesCard } from "@/features/settings/components/admin-exchange-rates-card";
import { AdminPricingConsole } from "@/features/settings/components/admin-pricing-console";
import { getAllRates } from "@/lib/exchange-rates/service";

export const metadata: Metadata = {
  title: "Pricing · Tomame admin",
};

/**
 * Never cached. Every figure here is configuration somebody may have changed a
 * minute ago, and the whole point of the console is that what it shows is what
 * the engine is currently using.
 */
export const dynamic = "force-dynamic";

/**
 * `/admin/settings` — the pricing console.
 *
 * WHAT THIS SCREEN IS FOR. Everything in a landed price except the item price
 * is set from here: the freight knobs, the fee, the tax tiers, the FX buffer,
 * which group prices which category. It used to be five cards of inputs with no
 * way of telling what any of them did. It is now arranged around one question —
 * *what would this change cost a customer?* — with a worked example, priced by
 * the real engine, sitting next to the knobs and moving as they are turned.
 *
 * Everything is read server-side with the service-role client. The example is
 * priced here too, so the page arrives with a real number on it rather than
 * fetching one after paint.
 *
 * Authorisation is the `/admin` layout's and `src/proxy.ts`'s; every write this
 * screen makes goes through an `/api/admin/*` route that checks again and
 * writes an `audit_logs` row.
 */
export default async function AdminSettingsPage() {
  const [constants, groups, mappings, rates, example] = await Promise.all([
    listPricingConstants(),
    listPricingGroupsWithCounts(),
    listCategoryMappings(),
    getAllRates(),
    priceWorkedExample(),
  ]);

  const values = Object.fromEntries(constants.map((row) => [row.key, row.value]));
  const missingKeys = collectMissingConstants(values);
  const bufferPct = typeof values.fx_buffer_pct === "number" ? values.fx_buffer_pct : null;

  return (
    <AdminPage
      title="Pricing"
      blurb="Every part of a landed price except what the store charges for the item. A change here applies to the next quote — never to a price a customer already holds."
    >
      <AdminCard index={0}>
        <div className="flex flex-col gap-2">
          <h2 className="text-[12px] leading-none font-bold tracking-normal text-tm-text-2">
            The formula
          </h2>
          <p className="tm-nums text-[14px] leading-[1.6] font-semibold text-tm-ink">
            (item + tax + item × fee) × exchange rate + freight
          </p>
          <p className="max-w-[72ch] text-[13px] leading-[1.55] font-medium text-tm-text-2">
            Freight is charged per item and takes one of four shapes: a group&rsquo;s flat cedi
            rate, a pre-negotiated rate for a recognised product, a weight expression built from
            the constants below, or nothing at all — in which case the product is sent to a human
            instead of being priced.
          </p>
        </div>
      </AdminCard>

      <AdminPricingConsole
        constants={constants}
        missingKeys={missingKeys}
        example={example.value}
        exampleError={example.error}
      />

      <AdminExchangeRatesCard
        rates={rates}
        renderedAt={new Date().toISOString()}
        bufferPct={bufferPct}
        midUsdRate={example.value?.breakdown.mid_market_rate ?? null}
        appliedUsdRate={example.value?.breakdown.exchange_rate ?? null}
      />

      <AdminPricingGroups groups={groups} />

      <AdminCategoryMappings mappings={mappings} groups={groups} />

      <AdminPricingTransfer />
    </AdminPage>
  );
}

/**
 * Price the worked example, or report why it could not be priced.
 *
 * `getFeesWorkedExample` throws a 503 when there is no USD→GHS rate, which is
 * the same failure the storefront hits — and it is exactly the thing this
 * screen exists to make visible. So it is caught and shown, rather than taking
 * the whole console down with it.
 */
async function priceWorkedExample(): Promise<{
  value: WorkedExample | null;
  error: string | null;
}> {
  try {
    return { value: await getFeesWorkedExample(), error: null };
  } catch (error) {
    return {
      value: null,
      error:
        error instanceof Error
          ? error.message
          : "The pricing engine refused to price the worked example.",
    };
  }
}
