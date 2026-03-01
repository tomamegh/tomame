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
  extractionMetadata: Record<string, unknown> | null;
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
