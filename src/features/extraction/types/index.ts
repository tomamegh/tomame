import type { ScrapedProduct } from "../scrapers/types";

export type { ScrapedProduct };

export interface ExtractionResult {
  extraction_attempted: boolean;
  extraction_success: boolean;
  platform: string | null;
  country: "USA" | "UK" | "CHINA" | null;
  product: ScrapedProduct;
  errors: string[];
  fetched_at: string;
  /** ID of the extraction_cache row — present when returned from the API */
  extraction_cache_id?: string | null;
}

export interface ProductPreviewProps {
  data: ExtractionResult;
  productUrl: string;
  onOrder: () => void;
  onReset: () => void;
}
