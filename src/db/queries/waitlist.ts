import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// ── Row types ───────────────────────────────────────────────────────────────

export interface WaitlistSignupInsert {
  email: string;
  phone: string | null;
  region_code: string;
  user_id: string | null;
}

export interface WaitlistInsertResult {
  /** null when the row already existed — the conflict is swallowed, not raised. */
  id: string | null;
  /** false when `(email, region_code)` was already on the list. */
  created: boolean;
}

/** Postgres foreign-key violation — an unknown `region_code`. */
const FOREIGN_KEY_VIOLATION = "23503";

export class UnknownRegionError extends Error {
  constructor(public readonly regionCode: string) {
    super(`Unknown region code: ${regionCode}`);
    this.name = "UnknownRegionError";
  }
}

// ── Queries ─────────────────────────────────────────────────────────────────

/**
 * Insert a waitlist signup. `waitlist_signups` has RLS on with no policies, so
 * this must run through the service-role client (mirrors `extraction_cache`).
 *
 * `UNIQUE (email, region_code)` is resolved with ON CONFLICT DO NOTHING, so a
 * repeat signup returns `{ created: false }` instead of raising — the caller
 * decides that this reads as success.
 */
export async function insertWaitlistSignup(
  input: WaitlistSignupInsert,
): Promise<WaitlistInsertResult> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("waitlist_signups")
    .upsert(input, { onConflict: "email,region_code", ignoreDuplicates: true })
    .select("id");

  if (error) {
    // Two foreign keys hang off this row (region_code, user_id); only the
    // region one is the caller's fault, so match on the constraint text.
    const mentionsRegion = `${error.message} ${error.details ?? ""}`.includes(
      "region_code",
    );
    if (error.code === FOREIGN_KEY_VIOLATION && mentionsRegion) {
      throw new UnknownRegionError(input.region_code);
    }
    throw new Error(`Failed to record waitlist signup: ${error.message}`);
  }

  const rows = (data ?? []) as { id: string }[];
  const inserted = rows[0];
  return { id: inserted ? String(inserted.id) : null, created: inserted != null };
}
