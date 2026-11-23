import "server-only";

import { setOrdersStoreTrackingUrl } from "@/db/queries/warehouse";
import { APIError } from "@/lib/auth/api-helpers";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import type { PlatformUser } from "@/features/users/types";
import { AUDIT_ENTITY_TYPES } from "@/config/constants";
import { requireWarehouse, warehouseActorRole } from "@/lib/auth/guards";

import { isShortLink, storeLinkProblem } from "../inbound/tracking-link";

/**
 * Store tracking links with no number in them (141): Amazon's Share tracking
 * (a.co/d/…). The hub cannot scan by a link, so it is kept on the order for
 * staff to open and, when shared, for the customer. Numbers still go through
 * `registerInboundTracking`.
 */

const FOLLOW_TIMEOUT_MS = 4000;

/**
 * Why this link cannot be kept, or null. A store short link is followed one
 * hop: Amazon's Share on a product page makes the same a.co/d/… shape as Share
 * tracking, and only the target tells them apart. When the store does not
 * answer, the link is kept: refusing on a timeout would lose a good link.
 */
export async function checkStoreLink(url: string): Promise<string | null> {
  const problem = storeLinkProblem(url);
  if (problem || !isShortLink(url)) return problem;
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(FOLLOW_TIMEOUT_MS),
      headers: { "user-agent": "Mozilla/5.0 (compatible; Tomame/1.0)" },
    });
    if (res.status === 404) return "That link opens nothing. Copy it again from the store: short links are case-sensitive.";
    const location = res.headers.get("location");
    if (!location) return null;
    const target = storeLinkProblem(new URL(location, url).toString(), { length: false });
    return target;
  } catch {
    return null;
  }
}

/** Keep (or, with null, clear) the link on these orders, audited per order. */
export async function setStoreTrackingLink(
  user: PlatformUser,
  orders: ReadonlyArray<{ order_id: string; order_no: string | null }>,
  url: string | null,
): Promise<string[]> {
  requireWarehouse(user);
  const written = await setOrdersStoreTrackingUrl(
    orders.map((o) => o.order_id),
    url,
  );
  for (const order of orders.filter((o) => written.includes(o.order_id))) {
    await logAuditEvent({
      actorId: user.id,
      actorRole: warehouseActorRole(user),
      action: url ? "order_store_tracking_link_set" : "order_store_tracking_link_cleared",
      entityType: AUDIT_ENTITY_TYPES.ORDER,
      entityId: order.order_id,
      metadata: { order_no: order.order_no, url },
    });
  }
  return written;
}

/** Take the link off one order. 404 when there is no such order. */
export async function clearStoreTrackingLink(user: PlatformUser, orderId: string): Promise<void> {
  const written = await setStoreTrackingLink(user, [{ order_id: orderId, order_no: null }], null);
  if (written.length === 0) throw new APIError(404, "Order not found");
}
