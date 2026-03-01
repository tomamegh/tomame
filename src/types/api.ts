// /** Standard API success response */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

/** Standard API error response */
export interface ApiErrorResponse {
  success: false;
  error: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ── Request Bodies ──────────────────────────────────────────

export interface SignupRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  password: string;
}

export interface ChangePasswordRequest {
  newPassword: string;
}

export interface PromoteUserRequest {
  userId: string;
}

export interface CreateAdminRequest {
  email: string;
  password: string;
}

export interface AdminResetPasswordRequest {
  email: string;
}

// ── Order Requests ─────────────────────────────────────────

export interface CreateOrderRequest {
  productUrl: string;
  productName: string;
  productImageUrl?: string;
  estimatedPriceUsd: number;
  quantity?: number;
  originCountry: "USA" | "UK" | "CHINA";
  specialInstructions?: string;
  needsReview?: boolean;
  reviewReasons?: string[];
  extractionMetadata?: Record<string, unknown>;
}

// ── Pricing Requests ───────────────────────────────────────

export interface UpdatePricingConfigRequest {
  region: "USA" | "UK" | "CHINA";
  baseShippingFeeUsd: number;
  exchangeRate: number;
  serviceFeePercentage: number;
}

// ── Payment Requests ──────────────────────────────────────────

export interface InitializePaymentRequest {
  orderId: string;
}

// ── Response Data ───────────────────────────────────────────

export interface AuthUserResponse {
  id: string;
  email: string;
  role: string;
}

export interface MessageResponse {
  message: string;
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
  pricing: import("@/types/db").OrderPricingBreakdown;
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

export interface OrderListResponse {
  orders: OrderResponse[];
  count: number;
}

export interface PaymentResponse {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}

export interface InitializePaymentResponse {
  payment: PaymentResponse;
  authorizationUrl: string;
}

export interface PricingConfigResponse {
  id: string;
  region: string;
  baseShippingFeeUsd: number;
  exchangeRate: number;
  serviceFeePercentage: number;
  lastUpdated: string;
}

export interface PricingConfigListResponse {
  configs: PricingConfigResponse[];
}

// ── Store Requests ────────────────────────────────────────

export interface CreateStoreRequest {
  domain: string;
  displayName: string;
}

export interface UpdateStoreRequest {
  displayName?: string;
  enabled?: boolean;
}

// ── Store Responses ───────────────────────────────────────

export interface SupportedStoreResponse {
  id: string;
  domain: string;
  displayName: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupportedStoreListResponse {
  stores: SupportedStoreResponse[];
}

export type PaginatedDataResponse<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};
