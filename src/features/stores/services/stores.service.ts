import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import type { AuthenticatedUser, ServiceResult } from "@/types/domain";
import type {
  SupportedStoreResponse,
  SupportedStoreListResponse,
} from "@/features/stores/types";
import type { DbSupportedStore } from "@/types/db";

// ── DB queries ────────────────────────────────────────────────────────────────

async function getEnabledStoreDomains(
  client: SupabaseClient,
): Promise<string[]> {
  try {
    const { data, error } = await client
      .from("supported_stores")
      .select("domain")
      .eq("enabled", true);

    if (error) {
      logger.error("getEnabledStoreDomains failed", { error: error.message });
      return [];
    }
    return (data ?? []).map((row: { domain: string }) => row.domain);
  } catch (err) {
    logger.error("getEnabledStoreDomains threw", { error: String(err) });
    return [];
  }
}

async function getEnabledStores(
  client: SupabaseClient,
): Promise<DbSupportedStore[]> {
  try {
    const { data, error } = await client
      .from("supported_stores")
      .select("*")
      .eq("enabled", true)
      .order("domain");

    if (error) {
      logger.error("getEnabledStores failed", { error: error.message });
      return [];
    }
    return (data ?? []) as DbSupportedStore[];
  } catch (err) {
    logger.error("getEnabledStores threw", { error: String(err) });
    return [];
  }
}

async function getAllStores(
  client: SupabaseClient,
): Promise<DbSupportedStore[]> {
  try {
    const { data, error } = await client
      .from("supported_stores")
      .select("*")
      .order("domain");

    if (error) {
      logger.error("getAllStores failed", { error: error.message });
      return [];
    }
    return (data ?? []) as DbSupportedStore[];
  } catch (err) {
    logger.error("getAllStores threw", { error: String(err) });
    return [];
  }
}

async function getStoreById(
  client: SupabaseClient,
  id: string,
): Promise<DbSupportedStore | null> {
  try {
    const { data, error } = await client
      .from("supported_stores")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      logger.error("getStoreById failed", { id, error: error.message });
      return null;
    }
    return data as DbSupportedStore;
  } catch (err) {
    logger.error("getStoreById threw", { error: String(err) });
    return null;
  }
}

async function insertStore(
  client: SupabaseClient,
  store: {
    domain: string;
    display_name: string;
    created_by: string;
  },
): Promise<DbSupportedStore | null> {
  try {
    const { data, error } = await client
      .from("supported_stores")
      .insert(store)
      .select()
      .single();

    if (error) {
      logger.error("insertStore failed", { error: error.message });
      return null;
    }
    return data as DbSupportedStore;
  } catch (err) {
    logger.error("insertStore threw", { error: String(err) });
    return null;
  }
}

async function updateStore(
  client: SupabaseClient,
  id: string,
  updates: Partial<{ display_name: string; enabled: boolean }>,
): Promise<DbSupportedStore | null> {
  try {
    const { data, error } = await client
      .from("supported_stores")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      logger.error("updateStore failed", { id, error: error.message });
      return null;
    }
    return data as DbSupportedStore;
  } catch (err) {
    logger.error("updateStore threw", { error: String(err) });
    return null;
  }
}

async function deleteStore(
  client: SupabaseClient,
  id: string,
): Promise<boolean> {
  try {
    const { error } = await client
      .from("supported_stores")
      .delete()
      .eq("id", id);

    if (error) {
      logger.error("deleteStore failed", { id, error: error.message });
      return false;
    }
    return true;
  } catch (err) {
    logger.error("deleteStore threw", { error: String(err) });
    return false;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Service functions ─────────────────────────────────────────────────────────

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
};
