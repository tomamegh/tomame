/** Standard API success response wrapper */
export interface ApiSuccessResponse<T> {
  data: T;
}

/** Standard API error response */
export interface ApiErrorResponse {
  error: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/** Generic paginated list response */
export type PaginatedDataResponse<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

/** Generic message response (e.g. success confirmations) */
export interface MessageResponse {
  message: string;
}
