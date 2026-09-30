import "server-only";
import { effectiveMonthlyCap, isProductionDeployment, type MonthlyCaps } from "@/config/catalog";
import { getOrCreateBudget, incrementBudget } from "@/db/queries/catalog";

/**
 * A job's monthly vendor budget, per deployment (see `effectiveMonthlyCap`).
 * The row in `job_budgets` is per database, so dev and prod count separately;
 * the cap is what keeps dev's count small while both spend one key.
 */
export interface BudgetState {
  used: number;
  cap: number;
}

/** 'YYYY-MM' in UTC — the budget period. */
export function budgetPeriodOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function defaultCap(caps: MonthlyCaps): number {
  return isProductionDeployment() ? caps.production : caps.other;
}

export async function readJobBudget(job: string, caps: MonthlyCaps, period: string): Promise<BudgetState> {
  const row = await getOrCreateBudget(job, period, defaultCap(caps));
  return { used: row.used, cap: effectiveMonthlyCap(caps, row.cap, isProductionDeployment()) };
}

/** `used += 1` for a spent vendor call (a failed call still costs). */
export async function spendJobBudget(job: string, caps: MonthlyCaps, period: string): Promise<BudgetState> {
  const row = await incrementBudget(job, period, 1, defaultCap(caps));
  return { used: row.used, cap: effectiveMonthlyCap(caps, row.cap, isProductionDeployment()) };
}
