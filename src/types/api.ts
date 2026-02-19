/** Standard API success response */
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
