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
 * Follow redirects on a shortened URL and return the final destination URL.
 * Returns the original URL unchanged if it is not a redirect.
 * Uses a HEAD request with a short timeout to avoid hanging on slow servers.
 */
export async function resolveUrl(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);

    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    clearTimeout(timeout);

    // response.url is the final URL after all redirects
    return response.url || url;
  } catch {
    // If HEAD fails (some servers block it), try GET with redirect follow
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);

      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      clearTimeout(timeout);
      return response.url || url;
    } catch {
      return url;
    }
  }
}

/**
 * Check if a product URL's domain is in the enabled supported stores.
 * Automatically resolves shortened URLs (e.g. a.co, amzn.to) before checking.
 */
export async function isDomainAllowed(url: string): Promise<{ allowed: boolean; resolvedUrl: string }> {
  try {
    const resolvedUrl = await resolveUrl(url);
    const hostname = new URL(resolvedUrl).hostname.toLowerCase();
    const domains = await getEnabledStoreDomains(supabaseAdmin);
    const allowed = domains.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    );
    return { allowed, resolvedUrl };
  } catch {
    return { allowed: false, resolvedUrl: url };
  }
}
