import type { OrderPricingBreakdown } from "@/types/db";

// ── Extraction metadata ───────────────────────────────────────────────────────

export interface ExtractionFieldMetadata {
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

/**
 * Full extraction result stored on every order.
 * All fields are present whether successfully extracted or null.
 */
export interface OrderExtractionMetadata {
  extractionAttempted: boolean;
  extractionSuccess: boolean;
  usedPuppeteer: boolean;
  fields: {
    name: ExtractionFieldMetadata;
    price: ExtractionFieldMetadata & { currency?: string };
    image: ExtractionFieldMetadata;
    country: ExtractionFieldMetadata;
    platform: ExtractionFieldMetadata;
    currency: ExtractionFieldMetadata;
    weight: ExtractionFieldMetadata;
    dimensions: ExtractionFieldMetadata;
    volume: ExtractionFieldMetadata;
  };
  errors: string[];
  fetchedAt: string;
  responseStatus: number | null;
}

// ── Domain types ─────────────────────────────────────────────────────────────

export type OrderStatus =
  | "pending"
  | "paid"
  | "processing"
  | "in_transit"
  | "delivered"
  | "completed"
  | "cancelled";

export type OriginCountry = "USA" | "UK" | "CHINA";

export interface OrderPricing {
  item_price_usd: number;
  quantity: number;
  subtotal_usd: number;
  shipping_fee_usd: number;
  service_fee_usd: number;
  total_usd: number;
  exchange_rate: number;
  total_ghs: number;
  total_pesewas: number;
  region: OriginCountry;
  service_fee_percentage: number;
}

export interface Order {
  id: string;
  userId: string;
  productUrl: string;
  productName: string;
  productImageUrl: string | null;
  estimatedPriceUsd: number;
  quantity: number;
  originCountry: OriginCountry;
  specialInstructions: string | null;
  status: OrderStatus;
  pricing: OrderPricing;
  needsReview: boolean;
  reviewReasons: string[];
  reviewedBy: string | null;
  reviewedAt: string | null;
  extractionMetadata: OrderExtractionMetadata | null;
  extractionData: Record<string, unknown> | null;
  trackingNumber: string | null;
  carrier: string | null;
  estimatedDeliveryDate: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderList {
  orders: Order[];
  count: number;
}

export interface CreateOrderInput {
  productUrl: string;
  productName: string;
  productImageUrl?: string;
  estimatedPriceUsd: number;
  quantity?: number;
  originCountry: OriginCountry;
  specialInstructions?: string;
}

// ── API request / response types ─────────────────────────────────────────────

export interface CreateOrderRequest {
  productUrl: string;
  productName: string;
  productImageUrl?: string;
  estimatedPriceUsd: number;
  quantity?: number;
  originCountry: OriginCountry;
  specialInstructions?: string;
  needsReview?: boolean;
  reviewReasons?: string[];
  extractionMetadata?: OrderExtractionMetadata;
}

export interface OrderResponse {
  id: string;
  productUrl: string;
  productName: string;
  productImageUrl: string | null;
  estimatedPriceUsd: number;
  quantity: number;
  originCountry: string;
  specialInstructions: string | null;
  status: string;
  pricing: OrderPricingBreakdown;
  needsReview: boolean;
  reviewReasons: string[];
  reviewedBy: string | null;
  reviewedAt: string | null;
  extractionMetadata: OrderExtractionMetadata | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderListResponse {
  orders: OrderResponse[];
  count: number;
}
