/**
 * `profiles` reads and writes for the account screen.
 *
 * Data access only (CLAUDE.md): no auth checks, no audit, no business rules.
 * Every function takes the client it should run under, so the caller decides
 * whether the query is RLS-bound (the viewer's client) or not. The account
 * screen always passes the viewer's client — 051 grants `authenticated` UPDATE
 * on exactly the six columns an account owns, and the 001 policies scope both
 * reads and writes to the caller's own row, so nothing here needs to re-check
 * ownership.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The columns the account screen shows or edits. Deliberately NOT `select("*")`:
 * `role` is not the account screen's business, and a widening `profiles` table
 * should not silently widen what this page ships to a browser.
 */
const ACCOUNT_COLUMNS =
  "id, first_name, last_name, bio, phone, whatsapp_opt_in, notify_email, created_at";

/** One `profiles` row, narrowed to what the account screen deals in. */
export interface AccountProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  bio: string | null;
  /** 051. Null on every account created before the account screen existed. */
  phone: string | null;
  /** 051. Customer asked for WhatsApp updates. */
  whatsapp_opt_in: boolean;
  /** 051. Customer wants transactional email. Defaults true. */
  notify_email: boolean;
  created_at: string;
}

/** The writable subset. Absent keys are left alone; `null` clears a column. */
export interface AccountProfilePatch {
  first_name?: string | null;
  last_name?: string | null;
  bio?: string | null;
  phone?: string | null;
  whatsapp_opt_in?: boolean;
  notify_email?: boolean;
}

export async function selectAccountProfile(
  client: SupabaseClient,
  userId: string,
): Promise<AccountProfileRow | null> {
  const { data, error } = await client
    .from("profiles")
    .select(ACCOUNT_COLUMNS)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load profile: ${error.message}`);
  }
  return (data as AccountProfileRow | null) ?? null;
}

/**
 * Applies a patch and returns the row as it now stands.
 *
 * `.eq("id", userId)` is belt to the RLS policy's braces: under the viewer's
 * client the policy already limits the statement to their own row, but this
 * function is also reachable with a service-role client and must not become a
 * table-wide UPDATE if someone ever passes one.
 */
export async function updateAccountProfile(
  client: SupabaseClient,
  userId: string,
  patch: AccountProfilePatch,
): Promise<AccountProfileRow> {
  const { data, error } = await client
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select(ACCOUNT_COLUMNS)
    .single();

  if (error) {
    throw new Error(`Failed to update profile: ${error.message}`);
  }
  return data as AccountProfileRow;
}

// ── Onboarding (064) ──────────────────────────────────────────────────────────
//
// A separate narrow projection, on the same principle as `ACCOUNT_COLUMNS`
// above: the app shell reads this on every signed-in `/app` render, and it has
// no business seeing `bio` or `phone` to answer "has this customer seen the
// tour".

const ONBOARDING_COLUMNS = "onboarding_completed_at, onboarding_dismissed_at";

export interface OnboardingStateRow {
  onboarding_completed_at: string | null;
  onboarding_dismissed_at: string | null;
}

export async function selectOnboardingState(
  client: SupabaseClient,
  userId: string,
): Promise<OnboardingStateRow | null> {
  const { data, error } = await client
    .from("profiles")
    .select(ONBOARDING_COLUMNS)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load onboarding state: ${error.message}`);
  }
  return (data as OnboardingStateRow | null) ?? null;
}

/**
 * Stamps exactly one of the two terminal columns with `now()`. Never both in
 * one call — "completed" and "dismissed" are alternatives, not a sequence.
 */
export async function updateOnboardingState(
  client: SupabaseClient,
  userId: string,
  column: "onboarding_completed_at" | "onboarding_dismissed_at",
): Promise<OnboardingStateRow> {
  const { data, error } = await client
    .from("profiles")
    .update({ [column]: new Date().toISOString() })
    .eq("id", userId)
    .select(ONBOARDING_COLUMNS)
    .single();

  if (error) {
    throw new Error(`Failed to update onboarding state: ${error.message}`);
  }
  return data as OnboardingStateRow;
}
