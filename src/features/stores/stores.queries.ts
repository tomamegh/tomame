import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbSupportedStore } from "@/types/db";
import { logger } from "@/lib/logger";

export async function getEnabledStoreDomains(
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

/** Returns only enabled stores as full objects — used by the public API. */
export async function getEnabledStores(
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

export async function getAllStores(
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

export async function getStoreById(
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

export async function insertStore(
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

export async function updateStore(
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

export async function deleteStore(
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
