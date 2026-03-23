import { PricingCalculator } from "@/lib/pricing";
import type { PricingInput, PricingBreakdown } from "@/lib/pricing";

export type { PricingInput as CalculatePricingInput };

export async function calculatePricing(
  input: PricingInput,
): Promise<PricingBreakdown> {
  const calculator = new PricingCalculator();
  return calculator.calculate(input);
}
