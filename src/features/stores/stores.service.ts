import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  getEnabledStoreDomains,
  getAllStores,
  getStoreById,
  insertStore,
  updateStore,
  deleteStore,
} from "@/features/stores/stores.queries";
import { logAuditEvent } from "@/features/audit/audit.service";
import type { AuthenticatedUser, ServiceResult } from "@/types/domain";
import type {
  SupportedStoreResponse,
  SupportedStoreListResponse,
} from "@/types/api";
import type { DbSupportedStore } from "@/types/db";

/** Map a DB row to the API response shape */
function toResponse(store: DbSupportedStore): SupportedStoreResponse {
  return {
    id: store.id,
    domain: store.domain,
    displayName: store.display_name,
    enabled: store.enabled,
    createdAt: store.created_at,
    updatedAt: store.updated_at,
  };
}

/**
 * Admin: list all stores (enabled + disabled).
 */
export async function listStores(
  user: AuthenticatedUser,
): Promise<ServiceResult<SupportedStoreListResponse>> {
  if (user.role !== "admin") {
    return { success: false, error: "Admin access required", status: 403 };
  }

  const stores = await getAllStores(supabaseAdmin);
  return { success: true, data: { stores: stores.map(toResponse) } };
}

/**
 * Public: list enabled stores only.
 */
export async function listEnabledStores(): Promise<
  ServiceResult<SupportedStoreListResponse>
> {
  const domains = await getEnabledStoreDomains(supabaseAdmin);
  // We need full store objects for enabled stores — fetch all and filter
  const allStores = await getAllStores(supabaseAdmin);
  const enabledStores = allStores.filter((s) => s.enabled);

  return { success: true, data: { stores: enabledStores.map(toResponse) } };
}

/**
 * Admin: create a new supported store.
 */
export async function createStore(
  admin: AuthenticatedUser,
  input: { domain: string; displayName: string },
): Promise<ServiceResult<SupportedStoreResponse>> {
  if (admin.role !== "admin") {
    return { success: false, error: "Admin access required", status: 403 };
  }

  const store = await insertStore(supabaseAdmin, {
    domain: input.domain,
    display_name: input.displayName,
    created_by: admin.id,
  });

  if (!store) {
    return {
      success: false,
      error: "Failed to create store (domain may already exist)",
      status: 400,
    };
  }

  await logAuditEvent({
    actorId: admin.id,
    actorRole: "admin",
    action: "store_created",
    entityType: "store",
    entityId: store.id,
    metadata: { domain: input.domain, displayName: input.displayName },
  });

  return { success: true, data: toResponse(store) };
}

/**
 * Admin: update a supported store.
 */
export async function updateStoreById(
  admin: AuthenticatedUser,
  storeId: string,
  input: { displayName?: string; enabled?: boolean },
): Promise<ServiceResult<SupportedStoreResponse>> {
  if (admin.role !== "admin") {
    return { success: false, error: "Admin access required", status: 403 };
  }

  const existing = await getStoreById(supabaseAdmin, storeId);
  if (!existing) {
    return { success: false, error: "Store not found", status: 404 };
  }

  const updates: Partial<{ display_name: string; enabled: boolean }> = {};
  if (input.displayName !== undefined) updates.display_name = input.displayName;
  if (input.enabled !== undefined) updates.enabled = input.enabled;

  const updated = await updateStore(supabaseAdmin, storeId, updates);
  if (!updated) {
    return { success: false, error: "Failed to update store", status: 500 };
  }

  await logAuditEvent({
    actorId: admin.id,
    actorRole: "admin",
    action: "store_updated",
    entityType: "store",
    entityId: storeId,
    metadata: {
      previous: {
        displayName: existing.display_name,
        enabled: existing.enabled,
      },
      updated: input,
    },
  });

  return { success: true, data: toResponse(updated) };
}

/**
 * Admin: delete a supported store.
 */
export async function deleteStoreById(
  admin: AuthenticatedUser,
  storeId: string,
): Promise<ServiceResult<{ message: string }>> {
  if (admin.role !== "admin") {
    return { success: false, error: "Admin access required", status: 403 };
  }

  const existing = await getStoreById(supabaseAdmin, storeId);
  if (!existing) {
    return { success: false, error: "Store not found", status: 404 };
  }

  const deleted = await deleteStore(supabaseAdmin, storeId);
  if (!deleted) {
    return { success: false, error: "Failed to delete store", status: 500 };
  }

  await logAuditEvent({
    actorId: admin.id,
    actorRole: "admin",
    action: "store_deleted",
    entityType: "store",
    entityId: storeId,
    metadata: { domain: existing.domain, displayName: existing.display_name },
  });

  return { success: true, data: { message: "Store deleted" } };
}

/**
 * Check if a product URL's domain is in the enabled supported stores.
 * Replaces the hardcoded ALLOWED_PRODUCT_DOMAINS check.
 */
export async function isDomainAllowed(url: string): Promise<boolean> {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const domains = await getEnabledStoreDomains(supabaseAdmin);
    return domains.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}
