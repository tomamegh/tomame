import type { ScrapedProduct } from "../scrapers/types";
import type { OrderPricingBreakdown } from "@/types/db";

export type { ScrapedProduct };

export interface ExtractionResult {
  extractionAttempted: boolean;
  extractionSuccess: boolean;
  platform: string | null;
  country: "USA" | "UK" | "CHINA" | null;
  product: ScrapedProduct;
  errors: string[];
  fetchedAt: string;
  /** Locked-in pricing quote (valid 24h). Null if price/country unavailable. */
  pricingQuote: OrderPricingBreakdown | null;
}

export interface ProductPreviewProps {
  data: ExtractionResult;
  productUrl: string;
  onOrder: () => void;
  onReset: () => void;
}
