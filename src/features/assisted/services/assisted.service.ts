import "server-only";

import {
  findOpenAssistedRequest,
  insertAssistedRequest,
  listAssistedRequests,
  transitionAssistedRequest,
  type AssistedRequestRow,
  type AssistedRequestStatus,
} from "@/db/queries/assisted-requests";
import { getExtractionRequestById } from "@/db/queries/extraction-requests";
import { getSiteSettingsMap } from "@/db/queries/site-settings";
import { whatsappHref } from "@/components/layout/marketing/links";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { AUDIT_ACTOR_ROLES, AUDIT_ENTITY_TYPES } from "@/config/constants";
import type { Viewer } from "@/features/quotes/types";
import { APIError } from "@/lib/auth/api-helpers";
import { logger } from "@/lib/logger";
import type { CreateAssistedRequestInput, TransitionAssistedRequestInput } from "../schema";
import type { AssistedRequest } from "../types";

/**
 * Assisted requests — the human fallback when extraction cannot read a page.
 *
 * Approved 2026-09-13: a buyer answers ON WHATSAPP, not a phone call. So the
 * customer-facing half of this service ends by handing back a `wa.me` link built
 * from `site_settings.whatsapp_number` — the same row the footer and Home's "Ask
 * a buyer" card read, so there is one number to change.
 */

/**
 * Record what the customer wants, and tell them how to reach a buyer.
 *
 * The link comes off the `extraction_request` row rather than the request body:
 * the customer is describing a paste we already hold, and letting the browser
 * name the URL would allow the description and the link to disagree — the buyer
 * would then shop for the wrong thing. Ownership of that paste is checked for the
 * same reason the bag checks it: a request id is a bare uuid the browser sends.
 */
export async function createAssistedRequest(
  viewer: Viewer,
  input: CreateAssistedRequestInput,
): Promise<AssistedRequest> {
  if (!viewer.userId && !viewer.sessionId) {
    throw new APIError(400, "We could not tell whose request this is. Reload and try again.");
  }

  const productUrl = await resolveProductUrl(viewer, input);

  // Pressing the button twice must not put the same job in the queue twice.
  const existing = await findOpenAssistedRequest({
    userId: viewer.userId,
    sessionId: viewer.sessionId,
    productUrl,
  });
  if (existing) return toAssistedRequest(existing, await supportWhatsappHref());

  const row = await insertAssistedRequest({
    userId: viewer.userId,
    sessionId: viewer.sessionId,
    extractionRequestId: input.extraction_request_id ?? null,
    productUrl,
    description: input.description,
    phone: input.phone,
  });

  // Audited because a person is now on the hook for it: the queue is worked by
  // hand and "when did this arrive" is the first question asked of a late one.
  await logAuditEvent({
    actorId: viewer.userId,
    actorRole: AUDIT_ACTOR_ROLES.USER,
    action: "assisted_request_created",
    entityType: AUDIT_ENTITY_TYPES.ASSISTED_REQUEST,
    entityId: row.id,
    metadata: { product_url: productUrl },
  });

  return toAssistedRequest(row, await supportWhatsappHref());
}

/**
 * The URL the buyer will shop for.
 *
 * A named paste wins: it is server-held and cannot be tampered with. A bare
 * `product_url` is only honoured when no paste was named, which is the
 * link-free path.
 */
async function resolveProductUrl(viewer: Viewer, input: CreateAssistedRequestInput): Promise<string> {
  if (!input.extraction_request_id) {
    if (!input.product_url) throw new APIError(400, "Name the link you are asking about");
    return input.product_url;
  }

  const request = await getExtractionRequestById(input.extraction_request_id);
  if (!request) throw new APIError(404, "We have no record of that link");

  const owned = request.user_id
    ? request.user_id === viewer.userId
    : !!request.session_id && request.session_id === viewer.sessionId;
  if (!owned) throw new APIError(404, "We have no record of that link");

  return request.product_url;
}

/** `site_settings.whatsapp_number` as a `wa.me` link, or null when none is set. */
async function supportWhatsappHref(): Promise<string | null> {
  try {
    const settings = await getSiteSettingsMap();
    const raw = settings.whatsapp_number;
    return typeof raw === "string" ? whatsappHref(raw) : null;
  } catch (error: unknown) {
    // A missing number costs the customer a convenience, not the request itself —
    // the row is already written and the buyer will still see it.
    logger.warn("assisted request: whatsapp number unavailable", { error: String(error) });
    return null;
  }
}

// ── Admin ────────────────────────────────────────────────────────────────────

export async function listAssistedQueue(status?: AssistedRequestStatus): Promise<AssistedRequestRow[]> {
  return listAssistedRequests(status);
}

/**
 * Claim or close one request. `from` is the status the buyer saw when they
 * opened the queue, so two of them acting at once cannot both take the same
 * customer — the second gets a 409 rather than silently overwriting the first.
 */
export async function moveAssistedRequest(
  adminId: string,
  id: string,
  from: AssistedRequestStatus,
  input: TransitionAssistedRequestInput,
): Promise<AssistedRequestRow> {
  const row = await transitionAssistedRequest({
    id,
    from,
    to: input.status,
    handledBy: adminId,
    note: input.note,
  });
  if (!row) throw new APIError(409, "Someone else already picked this one up. Refresh the queue.");

  await logAuditEvent({
    actorId: adminId,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    action: "assisted_request_updated",
    entityType: AUDIT_ENTITY_TYPES.ASSISTED_REQUEST,
    entityId: id,
    metadata: { from, to: input.status },
  });

  return row;
}

function toAssistedRequest(row: AssistedRequestRow, supportHref: string | null): AssistedRequest {
  return {
    id: row.id,
    product_url: row.product_url,
    description: row.description,
    status: row.status,
    created_at: row.created_at,
    whatsapp_href: supportHref,
  };
}
