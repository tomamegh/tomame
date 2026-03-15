import type { OrderPricingBreakdown } from "@/types/db";

// ── Extraction metadata ───────────────────────────────────────────────────────

/**
 * Full extraction result stored on every order.
 * Matches the ExtractionResult shape from the extraction feature.
 */
export interface OrderExtractionMetadata {
  extractionAttempted: boolean;
  extractionSuccess: boolean;
  platform: string | null;
  country: "USA" | "UK" | "CHINA" | null;
  product: {
    title: string | null;
    image: string | null;
    price: number | null;
    currency: string | null;
    description: string | null;
    brand: string | null;
    size: string | null;
    weight: string | null;
    dimensions: string | null;
    specifications: Record<string, string>;
    metadata: Record<string, unknown>;
  };
  errors: string[];
  fetchedAt: string;
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
  seller_shipping_usd: number;
  freight_usd: number;
  service_fee_usd: number;
  handling_fee_usd: number;
  total_usd: number;
  mid_market_rate: number;
  exchange_rate: number;
  total_ghs: number;
  total_pesewas: number;
  region: OriginCountry;
  service_fee_percentage: number;
  weight?: {
    actual_lbs: number | null;
    volumetric_lbs: number | null;
    chargeable_lbs: number;
    source: "scraped" | "internet_search" | "category_default";
  };
  /** @deprecated Use seller_shipping_usd + freight_usd */
  shipping_fee_usd?: number;
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
