import { PricingCalculator, collectMissingConstants } from "@/lib/pricing";
import type { PricingInput, PricingBreakdown, PricingConstants, FxOverride } from "@/lib/pricing";
import { getPricingConstantsMap } from "@/db/queries/pricing-constants";
import { getCategoryPricingMap } from "@/db/queries/pricing-groups";
import { getActiveFixedFreightItems } from "@/db/queries/fixed-freight-items";
import { getAllRates } from "@/lib/exchange-rates/service";
import { logger } from "@/lib/logger";
import { CACHE_TAGS, sharedCache } from "@/lib/shared-cache";

export type { PricingInput as CalculatePricingInput };

/**
 * Build a calculator with every admin-controlled input loaded from the DB.
 *
 * NO SUBSTITUTION. What the table holds is what the calculator gets. A missing
 * row used to be filled with a literal here (`map.freight_rate_per_lb ?? 5`),
 * which meant a half-configured environment quoted a real customer a real
 * total built from a number nobody had chosen. Now the gap travels: the
 * calculator that comes back returns `needs_review` instead of a price, and
 * the keys that are absent are named in the log, which is the one place a
 * constant name is useful to anybody.
 */
export async function loadPricingCalculator(): Promise<PricingCalculator> {
  const calculator = new PricingCalculator();

  const [constantsRes, categoryRes, fixedRes] = await Promise.allSettled([
    getPricingConstantsMap(),
    getCategoryPricingMap(),
    getActiveFixedFreightItems(),
  ]);

  if (constantsRes.status === "fulfilled") {
    const map = constantsRes.value;
    const missing = collectMissingConstants(map);
    if (missing.length > 0) {
      logger.warn("Pricing constants incomplete, quotes will be flagged for review, not priced", {
        missing,
        present: Object.keys(map).sort(),
      });
    }
    // Pass the rows through as they are; the calculator decides whether that
    // set can price, and refuses as a whole rather than per-field.
    calculator.setConstants(map as Partial<PricingConstants>);
  } else {
    logger.warn("Failed to load pricing constants from DB, quotes will be flagged for review, not priced", {
      error: String(constantsRes.reason),
    });
  }

  if (categoryRes.status === "fulfilled") {
    calculator.setCategoryPricing(categoryRes.value);
  } else {
    logger.warn("Failed to load category pricing from DB, falling back to JSON config", { error: String(categoryRes.reason) });
  }

  if (fixedRes.status === "fulfilled") {
    calculator.setFixedFreightItems(fixedRes.value);
  } else {
    logger.warn("Failed to load fixed freight items from DB", { error: String(fixedRes.reason) });
  }

  return calculator;
}

/** How long display totals may trail an admin pricing change. Charges never do. */
export const DISPLAY_PRICING_CACHE_SECONDS = 60;

/**
 * Every input a display calculator needs, in one shared read. JSON-shaped
 * because the data cache serialises: the category map travels as entries and
 * the rates as a plain record.
 */
const readDisplayPricingInputs = sharedCache(
  async () => {
    const [constants, categories, fixedFreight, rates] = await Promise.all([
      getPricingConstantsMap(),
      getCategoryPricingMap(),
      getActiveFixedFreightItems(),
      getAllRates(),
    ]);
    // `getAllRates` answers [] on a failed read. Keeping that for a minute would
    // send every display calculator to a live rate read per render, so it is
    // thrown instead: nothing is cached and the fresh loader takes over.
    if (rates.length === 0) throw new Error("No exchange rates read");
    return {
      constants,
      categories: [...categories.entries()],
      fixedFreight,
      rates: Object.fromEntries(rates.map((r) => [r.base_currency.toUpperCase(), Number(r.rate)])),
    };
  },
  ["pricing-display-inputs"],
  { tags: [CACHE_TAGS.pricingDisplay], revalidateSeconds: DISPLAY_PRICING_CACHE_SECONDS },
);

/**
 * A calculator for totals that are SHOWN, not charged: catalogue cards and
 * shop shelves, which every visitor renders with identical inputs. Built from a
 * read shared for `DISPLAY_PRICING_CACHE_SECONDS`, so a page of cards costs no
 * database call at all while the read is warm.
 *
 * Never for a charge. Order intake, quote locks, the quote screen and the
 * landed-price refresh keep `loadPricingCalculator`, which reads fresh.
 *
 * If the shared read fails it falls back to the fresh loader, which degrades
 * input by input exactly as it always has.
 */
export async function loadDisplayPricingCalculator(): Promise<PricingCalculator> {
  let inputs: Awaited<ReturnType<typeof readDisplayPricingInputs>>;
  try {
    inputs = await readDisplayPricingInputs();
  } catch (error) {
    logger.warn("Display pricing inputs unavailable, loading them fresh", {
      error: error instanceof Error ? error.message : String(error),
    });
    return loadPricingCalculator();
  }

  const calculator = new PricingCalculator();
  calculator.setConstants(inputs.constants as Partial<PricingConstants>);
  calculator.setCategoryPricing(new Map(inputs.categories));
  calculator.setFixedFreightItems(inputs.fixedFreight);
  calculator.useGhsRates(inputs.rates);
  return calculator;
}

/**
 * Price one line with every admin knob loaded. `fx` is `null` for the live
 * rate, or a quote lock's frozen pair — see `PricingCalculator.calculate`.
 */
export async function calculatePricing(input: PricingInput, fx: FxOverride | null): Promise<PricingBreakdown> {
  const calculator = await loadPricingCalculator();
  return calculator.calculate(input, fx);
}
