import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getEnabledStoreDomains,
  getEnabledStores,
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
} from "@/features/stores/types";
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
 * Expects an admin-scoped client (createAdminClient()).
 */
export async function listStores(
  client: SupabaseClient,
  user: AuthenticatedUser,
): Promise<ServiceResult<SupportedStoreListResponse>> {
  if (user.role !== "admin") {
    return { success: false, error: "Admin access required", status: 403 };
  }

  const stores = await getAllStores(client);
  return { success: true, data: { stores: stores.map(toResponse) } };
}

/**
 * Public: list enabled stores only.
 * Pass createClient() — RLS already filters to enabled=true for non-admins.
 */
export async function listEnabledStores(
  client: SupabaseClient,
): Promise<ServiceResult<SupportedStoreListResponse>> {
  const stores = await getEnabledStores(client);
  return { success: true, data: { stores: stores.map(toResponse) } };
}

/**
 * Admin: create a new supported store.
 * Expects an admin-scoped client (createAdminClient()).
 */
export async function createStore(
  client: SupabaseClient,
  admin: AuthenticatedUser,
  input: { domain: string; displayName: string },
): Promise<ServiceResult<SupportedStoreResponse>> {
  if (admin.role !== "admin") {
    return { success: false, error: "Admin access required", status: 403 };
  }

  const store = await insertStore(client, {
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
 * Expects an admin-scoped client (createAdminClient()).
 */
export async function updateStoreById(
  client: SupabaseClient,
  admin: AuthenticatedUser,
  storeId: string,
  input: { displayName?: string; enabled?: boolean },
): Promise<ServiceResult<SupportedStoreResponse>> {
  if (admin.role !== "admin") {
    return { success: false, error: "Admin access required", status: 403 };
  }

  const existing = await getStoreById(client, storeId);
  if (!existing) {
    return { success: false, error: "Store not found", status: 404 };
  }

  const updates: Partial<{ display_name: string; enabled: boolean }> = {};
  if (input.displayName !== undefined) updates.display_name = input.displayName;
  if (input.enabled !== undefined) updates.enabled = input.enabled;

  const updated = await updateStore(client, storeId, updates);
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
      previous: { displayName: existing.display_name, enabled: existing.enabled },
      updated: input,
    },
  });

  return { success: true, data: toResponse(updated) };
}

/**
 * Admin: delete a supported store.
 * Expects an admin-scoped client (createAdminClient()).
 */
export async function deleteStoreById(
  client: SupabaseClient,
  admin: AuthenticatedUser,
  storeId: string,
): Promise<ServiceResult<{ message: string }>> {
  if (admin.role !== "admin") {
    return { success: false, error: "Admin access required", status: 403 };
  }

  const existing = await getStoreById(client, storeId);
  if (!existing) {
    return { success: false, error: "Store not found", status: 404 };
  }

  const deleted = await deleteStore(client, storeId);
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
 * System-level check — uses admin client internally (no user session needed).
 */
export async function isDomainAllowed(url: string): Promise<boolean> {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const domains = await getEnabledStoreDomains(createAdminClient());
    // No configured stores means the table hasn't been seeded yet — allow all
    if (domains.length === 0) return true;
    return domains.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}
