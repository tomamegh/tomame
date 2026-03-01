export interface JsonLdProduct {
  name?: string;
  image?: string | string[] | { url?: string };
  offers?:
    | { price?: string | number; priceCurrency?: string }
    | Array<{ price?: string | number; priceCurrency?: string }>;
}

export interface ExtractionField {
  value: string | number | null;
  source:
    | "json_ld"
    | "og_meta"
    | "meta_tag"
    | "dom_selector"
    | "domain_mapping"
    | null;
  confidence: "high" | "medium" | "low" | null;
}

export interface ExtractionResult {
  extractionAttempted: boolean;
  extractionSuccess: boolean;
  fields: {
    name: ExtractionField;
    price: ExtractionField & { currency?: string };
    image: ExtractionField;
    country: ExtractionField;
  };
  errors: string[];
  fetchedAt: string;
  responseStatus: number | null;
}

export interface ProductPreviewProps {
  data: ExtractionResult;
  productUrl: string;
  onOrder: () => void;
  onReset: () => void;
}