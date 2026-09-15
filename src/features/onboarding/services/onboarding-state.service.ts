import "server-only";

import { getSiteSettingsMap } from "@/db/queries/site-settings";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { selectOnboardingState, updateOnboardingState } from "@/db/queries/profiles";
import { APIError } from "@/lib/auth/api-helpers";
import type { SetOnboardingStatusInput } from "../schema";

/**
 * Everything `shouldShowOnboardingTour` (the pure predicate) needs, resolved
 * once per `/app` render. Business logic only — the route this is called from
 * decides which HTTP status a `null` becomes.
 */
export interface OnboardingSignals {
  isAuthenticated: boolean;
  /** Null for a signed-out visitor. Namespaces the client's localStorage guard so one browser shared by two accounts cannot suppress the tour for the wrong one. */
  userId: string | null;
  firstName: string | null;
  onboardingCompletedAt: string | null;
  onboardingDismissedAt: string | null;
  /**
   * `site_settings.onboarding_tour_enabled` (066) — the admin's off switch.
   * False whenever the row is missing or unreadable, never true by default:
   * whether to interrupt a customer's first screen is a decision somebody has
   * to have made, and silence is not that decision.
   */
  tourEnabled: boolean;
}

const SIGNED_OUT_SIGNALS: OnboardingSignals = {
  isAuthenticated: false,
  userId: null,
  firstName: null,
  onboardingCompletedAt: null,
  onboardingDismissedAt: null,
  tourEnabled: false,
};

/**
 * Resolved alongside the rest of the app chrome, in `src/app/app/layout.tsx`.
 * A signed-out visitor short-circuits to the all-false shape rather than
 * running the two owner-scoped queries below, which would return nothing
 * useful for them anyway (RLS admits no rows to a caller with no session).
 */
export async function getOnboardingSignals(): Promise<OnboardingSignals> {
  const user = await getAuthenticatedUser();
  if (!user) return SIGNED_OUT_SIGNALS;

  const client = await createClient();
  const [state, tourEnabled] = await Promise.all([
    selectOnboardingState(client, user.id),
    readTourEnabled(),
  ]);

  return {
    isAuthenticated: true,
    userId: user.id,
    firstName: user.profile.first_name?.trim() || null,
    onboardingCompletedAt: state?.onboarding_completed_at ?? null,
    onboardingDismissedAt: state?.onboarding_dismissed_at ?? null,
    tourEnabled,
  };
}

/**
 * The admin's switch, read through the same cookieless client the rest of the
 * storefront's settings use (the row is public, 066).
 *
 * Only a stored `true` turns the tour on. A missing row, an unreadable table
 * and a value of any other shape all answer false, and a failure is logged
 * rather than thrown: a settings read that goes wrong must not take the app
 * shell down, and the safe answer for a thing that interrupts a customer is to
 * leave them alone.
 */
async function readTourEnabled(): Promise<boolean> {
  try {
    const settings = await getSiteSettingsMap();
    return settings.onboarding_tour_enabled === true;
  } catch (error) {
    logger.warn("onboarding: could not read the tour setting; leaving the tour off", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Stamps the terminal column the tour just reached — through the CALLER'S own
 * client, not the service role, the same way `updateAccountProfile` (051)
 * writes the rest of `profiles`: RLS ("Users can update own profile", 001) and
 * the column grant (064) are what authorise the write, not this function.
 *
 * No audit entry. `audit_logs` (CLAUDE.md) is for mutations to payment status,
 * order status, roles and job state — a customer closing a tooltip is none of
 * those, and it is not a fact any admin screen reads back.
 */
export async function setOnboardingStatus(
  userId: string,
  input: SetOnboardingStatusInput,
): Promise<void> {
  const client = await createClient();
  const column =
    input.status === "completed" ? "onboarding_completed_at" : "onboarding_dismissed_at";

  try {
    await updateOnboardingState(client, userId, column);
  } catch (error) {
    throw new APIError(500, error instanceof Error ? error.message : "Failed to save");
  }
}
