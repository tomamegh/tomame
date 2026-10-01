import "server-only";

import { AUDIT_ACTOR_ROLES, AUDIT_ENTITY_TYPES } from "@/config/constants";
import { FIXED_FREIGHT_CATEGORY_MAP } from "@/config/fixed-freight-categories";
import {
  getActiveFixedFreightItems,
  getFixedFreightItemById,
  insertFixedFreightItem,
  listAllFixedFreightItems,
  updateFixedFreightItem as updateFixedFreightItemRow,
  type AdminFixedFreightItemRow,
  type FixedFreightItemWrite,
} from "@/db/queries/fixed-freight-items";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import type { PlatformUser } from "@/features/users/types";
import { APIError } from "@/lib/auth/api-helpers";
import {
  fixedFreightCategoryAllows,
  matchFixedFreightItem,
} from "@/lib/pricing/fixed-freight-match";
import type {
  CreateFixedFreightItemInput,
  TestFixedFreightTitleInput,
  UpdateFixedFreightItemInput,
} from "../schema";

/**
 * The fixed freight price list, as the admin pricing console edits it.
 *
 * Rows are never deleted: `extraction_cache` snapshots carry the
 * `fixed_freight_item_id` that priced them, so an item is retired with
 * `is_active = false`. A write changes the next quote only; a price a customer
 * already holds lives in its snapshot and does not move.
 */

export const FIXED_FREIGHT_AUDIT_ACTIONS = {
  created: "fixed_freight_item_created",
  updated: "fixed_freight_item_updated",
} as const;

export const FIXED_FREIGHT_CONFLICT_MESSAGE = "Someone else just changed this item. Reload to see their version.";

/** Two timestamptz strings name the same instant (formats may differ in offset spelling). */
function sameInstant(a: string, b: string): boolean {
  if (a === b) return true;
  const micros = (v: string) => {
    const m = /\.(\d+)/.exec(v);
    return `${Date.parse(v)}:${(m?.[1] ?? "").padEnd(6, "0").slice(0, 6)}`;
  };
  return !Number.isNaN(Date.parse(a)) && micros(a) === micros(b);
}

export function listFixedFreightItemsForAdmin(): Promise<
  AdminFixedFreightItemRow[]
> {
  return listAllFixedFreightItems();
}

/** Shelves the category gate knows. A shelf outside this set is keyword-only. */
export function gatedFixedFreightShelves(): string[] {
  return Object.keys(FIXED_FREIGHT_CATEGORY_MAP);
}

const snapshot = (row: AdminFixedFreightItemRow): FixedFreightItemWrite => ({
  category: row.category,
  product_name: row.product_name,
  freight_rate_ghs: row.freight_rate_ghs,
  keywords: row.keywords,
  sort_order: row.sort_order,
  is_active: row.is_active,
});

export async function createFixedFreightItem(
  admin: PlatformUser,
  input: CreateFixedFreightItemInput,
): Promise<AdminFixedFreightItemRow> {
  const created = await insertFixedFreightItem(input);
  await logAuditEvent({
    actorId: admin.id,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    action: FIXED_FREIGHT_AUDIT_ACTIONS.created,
    entityType: AUDIT_ENTITY_TYPES.FIXED_FREIGHT_ITEM,
    entityId: created.id,
    metadata: { before: null, after: snapshot(created) },
  });
  return created;
}

export async function updateFixedFreightItem(
  admin: PlatformUser,
  id: string,
  input: UpdateFixedFreightItemInput,
): Promise<AdminFixedFreightItemRow> {
  const before = await getFixedFreightItemById(id);
  if (!before) throw new APIError(404, "Fixed freight item not found");

  const { expected_updated_at: expectedUpdatedAt, ...fields } = input;
  // The admin edited a copy they loaded earlier; if the row moved since, their
  // diff is against a stale version.
  if (expectedUpdatedAt !== undefined && !sameInstant(expectedUpdatedAt, before.updated_at)) {
    throw new APIError(409, FIXED_FREIGHT_CONFLICT_MESSAGE);
  }

  const patch: Partial<FixedFreightItemWrite> = {};
  for (const [key, value] of Object.entries(fields) as [
    keyof FixedFreightItemWrite,
    unknown,
  ][]) {
    if (value !== undefined) (patch as Record<string, unknown>)[key] = value;
  }

  // Conditional on the stamp read as `before`, so the audit's `before` is the
  // row this write actually replaced.
  const after = await updateFixedFreightItemRow(id, patch, before.updated_at);
  if (!after) {
    const still = await getFixedFreightItemById(id);
    if (!still) throw new APIError(404, "Fixed freight item not found");
    throw new APIError(409, FIXED_FREIGHT_CONFLICT_MESSAGE);
  }

  await logAuditEvent({
    actorId: admin.id,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    action: FIXED_FREIGHT_AUDIT_ACTIONS.updated,
    entityType: AUDIT_ENTITY_TYPES.FIXED_FREIGHT_ITEM,
    entityId: id,
    metadata: {
      product_name: after.product_name,
      changes: patch,
      before: snapshot(before),
      after: snapshot(after),
    },
  });
  return after;
}

export interface FixedFreightTitleTest {
  match: {
    id: string;
    product_name: string;
    category: string;
    freight_rate_ghs: number;
    keyword: string;
  } | null;
  /** Active items whose shelf the category gate turned away for this category. */
  gated_out: number;
}

/**
 * Which active item would price this title, using the engine's own matcher
 * against the same rows a quote loads.
 */
export async function testFixedFreightTitle(
  input: TestFixedFreightTitleInput,
): Promise<FixedFreightTitleTest> {
  const items = await getActiveFixedFreightItems();
  const hit = matchFixedFreightItem(items, input.title, input.category);
  const gatedOut = items.filter(
    (item) => !fixedFreightCategoryAllows(item.category, input.category),
  ).length;
  return {
    match: hit
      ? {
          id: hit.item.id,
          product_name: hit.item.product_name,
          category: hit.item.category,
          freight_rate_ghs: hit.item.freight_rate_ghs,
          keyword: hit.keyword,
        }
      : null,
    gated_out: gatedOut,
  };
}
