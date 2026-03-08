import type { ScrapedProduct } from "../scrapers/types";

export type { ScrapedProduct };

export interface ExtractionResult {
  extractionAttempted: boolean;
  extractionSuccess: boolean;
  platform: string | null;
  country: "USA" | "UK" | "CHINA" | null;
  product: ScrapedProduct;
  errors: string[];
  fetchedAt: string;
}

export interface ProductPreviewProps {
  data: ExtractionResult;
  productUrl: string;
  onOrder: () => void;
  onReset: () => void;
}
