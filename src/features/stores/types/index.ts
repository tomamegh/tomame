// ── Request types ────────────────────────────────────────────────────────────

export interface CreateStoreRequest {
  domain: string;
  displayName: string;
}

export interface UpdateStoreRequest {
  displayName?: string;
  enabled?: boolean;
}

// ── Response types ───────────────────────────────────────────────────────────

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
