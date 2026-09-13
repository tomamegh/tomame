import "server-only";
import { APIError } from "@/lib/auth/api-helpers";
import { listActiveDeliveryZones } from "@/db/queries/delivery-zones";
import {
  clearDefaultAddress,
  deleteDeliveryAddress,
  getDeliveryAddressById,
  insertDeliveryAddress,
  listDeliveryAddresses,
  updateDeliveryAddress,
} from "@/db/queries/delivery-addresses";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import type { DeliveryAddress } from "../types";
import type { CreateAddressInput, UpdateAddressInput } from "../schema";

/**
 * The customer's address book. Every row is owner-scoped: a foreign id reads
 * as 404, never 403, so the endpoint does not confirm that someone else's
 * address exists. Exactly one address is the default (partial unique index
 * `uq_delivery_addresses_default`), so every path that sets it clears first.
 */

export async function listAddresses(userId: string): Promise<DeliveryAddress[]> {
  return listDeliveryAddresses(userId);
}

export async function createAddress(userId: string, input: CreateAddressInput): Promise<DeliveryAddress> {
  await assertDoorZone(input.delivery_zone_id);
  const existing = await listDeliveryAddresses(userId);
  // The first address is the default whether or not the client asked — a bag
  // with exactly one address should never have to ask "deliver where?".
  const isDefault = existing.length === 0 || input.is_default;
  if (isDefault && existing.length > 0) await clearDefaultAddress(userId);

  const row = await insertDeliveryAddress(userId, { ...input, is_default: isDefault });
  await logAuditEvent({ actorId: userId, actorRole: "user", action: "address_created", entityType: "delivery_address", entityId: row.id, metadata: { is_default: isDefault } });
  return row;
}

export async function updateAddress(userId: string, id: string, input: UpdateAddressInput): Promise<DeliveryAddress> {
  const current = await getOwned(userId, id);
  if (input.delivery_zone_id !== undefined) await assertDoorZone(input.delivery_zone_id);

  const patch: UpdateAddressInput = { ...input };
  if (input.is_default === true && !current.is_default) await clearDefaultAddress(userId);
  // Un-defaulting the default would leave the book with none; the way to move
  // it is to set another address as default.
  if (input.is_default === false && current.is_default) delete patch.is_default;

  const row = await updateDeliveryAddress(id, patch);
  if (!row) throw new APIError(404, "Address not found");
  await logAuditEvent({ actorId: userId, actorRole: "user", action: "address_updated", entityType: "delivery_address", entityId: id, metadata: { fields: Object.keys(patch) } });
  return row;
}

export async function deleteAddress(userId: string, id: string): Promise<void> {
  const current = await getOwned(userId, id);
  const deleted = await deleteDeliveryAddress(id);
  if (!deleted) throw new APIError(404, "Address not found");

  let promoted: string | null = null;
  if (current.is_default) {
    // Oldest remaining becomes default so the book never lacks one.
    const rest = await listDeliveryAddresses(userId);
    const oldest = [...rest].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    if (oldest) {
      await updateDeliveryAddress(oldest.id, { is_default: true });
      promoted = oldest.id;
    }
  }
  await logAuditEvent({ actorId: userId, actorRole: "user", action: "address_deleted", entityType: "delivery_address", entityId: id, metadata: { promoted_default: promoted } });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getOwned(userId: string, id: string): Promise<DeliveryAddress> {
  const row = await getDeliveryAddressById(id);
  if (!row || row.user_id !== userId) throw new APIError(404, "Address not found");
  return row;
}

/** A saved address is charged at a door zone's fee; pickup zones and retired zones are not addresses. */
async function assertDoorZone(zoneId: string): Promise<void> {
  const zones = await listActiveDeliveryZones();
  const zone = zones.find((z) => z.id === zoneId);
  if (!zone || zone.kind !== "door") throw new APIError(400, "Choose a delivery zone we serve");
}
