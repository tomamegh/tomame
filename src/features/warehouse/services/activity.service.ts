import "server-only";

import { WAREHOUSE_ACTIVITY_KINDS } from "@/config/constants";
import type { WarehouseActivityInsert } from "@/db/queries/warehouse-activity";
import type { PlatformUser } from "@/features/users/types";
import { canAccessWarehouse } from "@/lib/auth/admin-access";
import { warehouseActorRole } from "@/lib/auth/guards";
import { logger } from "@/lib/logger";

/**
 * The warehouse's read trail (082): page views, scans, failed lookups, label
 * views. The admin reads it on `/admin/warehouse`; nobody else can.
 *
 * NEVER THROWS. This is called from inside the operator's own request — a
 * lookup, a label render — and a trail that could fail a scan would be worse
 * than no trail. Every failure is logged and swallowed.
 *
 * The query module is imported lazily, inside the `try`, for the same reason: it
 * builds the service-role client when it loads, and the warehouse service must
 * not depend on that succeeding (its own tests load it with no database at all).
 *
 * The actor is always `user`, the session's own account. No caller can record
 * activity on somebody else's behalf, and the beacon's body carries no id.
 */

type ActivityInput = Omit<WarehouseActivityInsert, "actor_id" | "actor_role">;

export async function recordWarehouseActivity(
  user: PlatformUser,
  input: ActivityInput,
): Promise<void> {
  try {
    if (!canAccessWarehouse(user)) return;
    const { insertWarehouseActivity } = await import("@/db/queries/warehouse-activity");
    await insertWarehouseActivity({
      ...input,
      path: cleanPath(input.path),
      actor_id: user.id,
      actor_role: warehouseActorRole(user),
    });
  } catch (error) {
    logger.warn("warehouse activity: could not record", {
      kind: input.kind,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * A page view from the beacon. The path was validated by the route. A package's
 * or an item's own page carries it as the subject, so searching the admin's
 * timeline for PKG-10001 finds the times somebody looked at it.
 */
export function recordWarehousePageView(user: PlatformUser, path: string): Promise<void> {
  return recordWarehouseActivity(user, {
    kind: WAREHOUSE_ACTIVITY_KINDS.PAGE_VIEW,
    path,
    ...pageSubject(path),
  });
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PACKAGE_PAGE = new RegExp(`^/warehouse/packages/(${UUID})/?$`, "i");
const ITEM_PAGE = new RegExp(`^/warehouse/items/(${UUID})/?$`, "i");

export function pageSubject(
  path: string,
): { subject_type: "warehouse_package" | "order"; subject_id: string } | Record<string, never> {
  const pkg = path.match(PACKAGE_PAGE)?.[1];
  if (pkg) return { subject_type: "warehouse_package", subject_id: pkg.toLowerCase() };
  const item = path.match(ITEM_PAGE)?.[1];
  if (item) return { subject_type: "order", subject_id: item.toLowerCase() };
  return {};
}

/** Pathname only, capped at the column's 300. Anything after `?` or `#` is dropped. */
export function cleanPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const bare = path.split(/[?#]/, 1)[0]?.trim() ?? "";
  return bare ? bare.slice(0, 300) : null;
}
