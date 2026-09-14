import "server-only";

import {
  deletePolicyBySlug,
  getPolicyBySlug,
  insertPolicy,
  PolicySlugTakenError,
  updatePolicyBySlug,
} from "@/db/queries/policies";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { AUDIT_ACTOR_ROLES, AUDIT_ENTITY_TYPES } from "@/config/constants";
import { APIError } from "@/lib/auth/api-helpers";
import type { PolicyRow } from "../types";

/**
 * Admin writes to `policies` — the terms, the privacy notice, the returns text.
 *
 * EVERY CHANGE HERE IS AUDITED, and not as housekeeping. This table is the only
 * public statement of what Tomame owes a customer, and until this service
 * existed "who unpublished the returns policy, and when" had no answer: the
 * routes wrote the table inline and no `audit_logs` row was left behind.
 * CLAUDE.md does not permit a mutation to public legal text without one.
 *
 * `policies.id` is a UUID, so it goes in `entity_id` directly and the slug rides
 * along in metadata for the queries that read by name. The publish flag is
 * recorded with BOTH its old and its new value, because unpublishing is the
 * change that silently removes a page from the site and is the one an
 * investigation will be looking for.
 *
 * Layering: the routes above authenticate, rate-limit and shape the response;
 * the reads and writes are `db/queries/policies`. Nothing here touches an HTTP
 * object.
 */

/** Who made the change. Resolved by the route from the admin session. */
export interface PolicyActor {
  id: string;
  email: string | null;
}

export async function createPolicy(
  actor: PolicyActor,
  input: {
    slug: string;
    label: string;
    content: string;
    effective_date?: string;
    is_published: boolean;
  },
): Promise<PolicyRow> {
  let row: PolicyRow;
  try {
    row = await insertPolicy({
      slug: input.slug,
      label: input.label,
      content: input.content,
      effectiveDate: input.effective_date ?? null,
      isPublished: input.is_published,
    });
  } catch (error) {
    // A taken slug is the admin's mistake, not a server fault — 409, with the
    // same sentence the route used to build itself.
    if (error instanceof PolicySlugTakenError) throw new APIError(409, error.message);
    throw error;
  }

  await logAuditEvent({
    actorId: actor.id,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    action: "policy_created",
    entityType: AUDIT_ENTITY_TYPES.POLICY,
    entityId: row.id,
    metadata: {
      table: "policies",
      slug: row.slug,
      label: row.label,
      isPublished: row.is_published,
      actorEmail: actor.email,
    },
  });

  return row;
}

/**
 * Edit one policy's text, date and publish flag.
 *
 * The current row is read first so the audit entry can say what changed rather
 * than only what it is now; a missing slug is a 404 before anything is written.
 */
export async function updatePolicy(
  actor: PolicyActor,
  slug: string,
  input: { content: string; is_published: boolean; effective_date?: string | null },
): Promise<PolicyRow> {
  const current = await getPolicyBySlug(slug);
  if (!current) throw new APIError(404, "Policy not found");

  const row = await updatePolicyBySlug(slug, {
    content: input.content,
    isPublished: input.is_published,
    effectiveDate: input.effective_date ?? null,
  });
  if (!row) throw new APIError(404, "Policy not found");

  const publishChanged = current.is_published !== row.is_published;

  await logAuditEvent({
    actorId: actor.id,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    // A publish toggle gets its own action so the log can be filtered for the
    // change that takes a legal page off the site.
    action: publishChanged
      ? row.is_published
        ? "policy_published"
        : "policy_unpublished"
      : "policy_updated",
    entityType: AUDIT_ENTITY_TYPES.POLICY,
    entityId: row.id,
    metadata: {
      table: "policies",
      slug: row.slug,
      label: row.label,
      previousPublished: current.is_published,
      newPublished: row.is_published,
      contentChanged: current.content !== row.content,
      previousEffectiveDate: current.effective_date,
      newEffectiveDate: row.effective_date,
      actorEmail: actor.email,
    },
  });

  return row;
}

/**
 * Remove a policy outright.
 *
 * The deleted row comes back from the query so the audit entry keeps a copy of
 * the length and the publish state of what vanished — `audit_logs` is
 * append-only and is the only remaining trace once the row is gone. Deleting a
 * slug that is already absent is a no-op and writes nothing: the caller's
 * response is unchanged either way.
 */
export async function deletePolicy(actor: PolicyActor, slug: string): Promise<PolicyRow | null> {
  const row = await deletePolicyBySlug(slug);
  if (!row) return null;

  await logAuditEvent({
    actorId: actor.id,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    action: "policy_deleted",
    entityType: AUDIT_ENTITY_TYPES.POLICY,
    entityId: row.id,
    metadata: {
      table: "policies",
      slug: row.slug,
      label: row.label,
      wasPublished: row.is_published,
      effectiveDate: row.effective_date,
      contentLength: row.content.length,
      actorEmail: actor.email,
    },
  });

  return row;
}
