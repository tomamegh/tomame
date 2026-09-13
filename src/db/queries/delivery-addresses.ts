import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DeliveryAddress } from "@/features/addresses/types";
import type { CreateAddressInput, UpdateAddressInput } from "@/features/addresses/schema";

// Data access only (service role — every write is the server's). Owner checks,
// default promotion and zone validation live in addresses.service.ts.
const COLUMNS = "id, user_id, label, kind, recipient_name, phone, line1, line2, area, city, region, delivery_zone_id, digital_address, is_default, created_at, updated_at";

export async function listDeliveryAddresses(userId: string): Promise<DeliveryAddress[]> {
  const { data, error } = await createAdminClient().from("delivery_addresses").select(COLUMNS).eq("user_id", userId).order("is_default", { ascending: false }).order("created_at");
  if (error) throw new Error(`Failed to load addresses: ${error.message}`);
  return (data ?? []) as DeliveryAddress[];
}

export async function getDeliveryAddressById(id: string): Promise<DeliveryAddress | null> {
  const { data, error } = await createAdminClient().from("delivery_addresses").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Failed to load address: ${error.message}`);
  return (data as DeliveryAddress | null) ?? null;
}

/** Saved addresses are always `door`; pickup is a zone choice at checkout, not a row here. */
export async function insertDeliveryAddress(userId: string, input: CreateAddressInput): Promise<DeliveryAddress> {
  const { data, error } = await createAdminClient()
    .from("delivery_addresses")
    .insert({ user_id: userId, kind: "door", ...toRow(input) })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`Failed to save address: ${error.message}`);
  return data as DeliveryAddress;
}

export async function updateDeliveryAddress(id: string, patch: UpdateAddressInput): Promise<DeliveryAddress | null> {
  const { data, error } = await createAdminClient()
    .from("delivery_addresses")
    .update({ ...toRow(patch), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`Failed to update address: ${error.message}`);
  return (data as DeliveryAddress | null) ?? null;
}

export async function deleteDeliveryAddress(id: string): Promise<boolean> {
  const { data, error } = await createAdminClient().from("delivery_addresses").delete().eq("id", id).select("id");
  if (error) throw new Error(`Failed to delete address: ${error.message}`);
  return (data ?? []).length > 0;
}

/** Unset `is_default` on every address of the user (before setting a new default — the partial unique index allows one). */
export async function clearDefaultAddress(userId: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("delivery_addresses")
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("is_default", true);
  if (error) throw new Error(`Failed to clear default address: ${error.message}`);
}

/**
 * Optional text fields arrive as `undefined` (omitted) or "" (cleared). Both
 * store as NULL; an omitted key on PATCH must not touch the column at all.
 */
function toRow(input: Partial<CreateAddressInput>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    row[key] = typeof value === "string" && value === "" ? null : value;
  }
  return row;
}
