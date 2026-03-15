import type { ScrapedProduct } from "../scrapers/types";
import type { OrderPricingBreakdown } from "@/types/db";

export type { ScrapedProduct };

export interface StaticPriceMatch {
  id: string;
  category: string;
  productName: string;
  priceGhs: number;
  priceMinGhs: number | null;
  priceMaxGhs: number | null;
}

export interface WeightInfo {
  /** Weight in lbs */
  weightLbs: number;
  /** How the weight was determined */
  source: "scraped" | "internet_search" | "category_default";
  /** Source URL (for internet_search) */
  sourceUrl?: string | null;
}

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
  /** Matched fixed-freight entry from the static price list, if any. */
  staticPriceMatch: StaticPriceMatch | null;
  /** Resolved weight info for freight calculation */
  weightInfo: WeightInfo | null;
}

export interface ProductPreviewProps {
  data: ExtractionResult;
  productUrl: string;
  onOrder: () => void;
  onReset: () => void;
}
