import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { PolicyRow } from "@/features/policies/types";

/**
 * `policies` — the public legal text (terms, privacy, returns).
 *
 * Data access only. Who may write, what a duplicate slug means to the caller and
 * the audit row every change owes are `features/policies/services` (CLAUDE.md:
 * `db/queries` holds no business logic and no auth checks).
 *
 * Every write goes through the service-role client, which bypasses RLS — the
 * reason this file is `server-only` and why each route calls `requireAdmin`
 * before it reaches here. Errors are NOT swallowed: an admin who has just
 * unpublished the returns policy must be told when it did not save.
 */

const COLUMNS = "id, slug, label, content, effective_date, last_updated, is_published";

/** Postgres unique violation on `policies.slug`. */
const UNIQUE_VIOLATION = "23505";

/**
 * Thrown instead of a bare `Error` when the slug is taken, so the service can
 * answer 409 rather than 500 without reading postgres error codes itself —
 * a `SELECT` first would race two admins creating the same slug anyway.
 */
export class PolicySlugTakenError extends Error {
  constructor(public readonly slug: string) {
    super(`A policy with slug "${slug}" already exists`);
    this.name = "PolicySlugTakenError";
  }
}

export async function getPolicyBySlug(slug: string): Promise<PolicyRow | null> {
  const { data, error } = await createAdminClient()
    .from("policies")
    .select(COLUMNS)
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(`Failed to load the policy: ${error.message}`);
  return (data as PolicyRow | null) ?? null;
}

export async function insertPolicy(input: {
  slug: string;
  label: string;
  content: string;
  effectiveDate: string | null;
  isPublished: boolean;
}): Promise<PolicyRow> {
  const { data, error } = await createAdminClient()
    .from("policies")
    .insert({
      slug: input.slug,
      label: input.label,
      content: input.content,
      effective_date: input.effectiveDate,
      is_published: input.isPublished,
    })
    .select(COLUMNS)
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new PolicySlugTakenError(input.slug);
    throw new Error(`Failed to create the policy: ${error.message}`);
  }
  return data as PolicyRow;
}

/**
 * Replace the editable half of one policy. `last_updated` is stamped here and
 * never taken from the client — it is what the public page shows as the date
 * the terms last changed.
 */
export async function updatePolicyBySlug(
  slug: string,
  patch: { content: string; isPublished: boolean; effectiveDate: string | null },
): Promise<PolicyRow | null> {
  const { data, error } = await createAdminClient()
    .from("policies")
    .update({
      content: patch.content,
      is_published: patch.isPublished,
      effective_date: patch.effectiveDate,
      last_updated: new Date().toISOString(),
    })
    .eq("slug", slug)
    .select(COLUMNS)
    .maybeSingle();

  if (error) throw new Error(`Failed to update the policy: ${error.message}`);
  return (data as PolicyRow | null) ?? null;
}

/**
 * Delete one policy and hand back the row that went, so the audit entry can
 * record what the text said before it stopped existing. Null means there was
 * nothing there to delete.
 */
export async function deletePolicyBySlug(slug: string): Promise<PolicyRow | null> {
  const { data, error } = await createAdminClient()
    .from("policies")
    .delete()
    .eq("slug", slug)
    .select(COLUMNS)
    .maybeSingle();

  if (error) throw new Error(`Failed to delete the policy: ${error.message}`);
  return (data as PolicyRow | null) ?? null;
}
