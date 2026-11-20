/**
 * The public fee promise — "Tomame fee – 4% flat on the item price. No
 * category tiers." (`config/price-story.ts`) — holds only while every active
 * pricing group charges exactly `default_value_fee_pct`, at and above its
 * threshold. The site no longer prints a "x%–y%, depending on the category"
 * qualifier, so a group that drifts would make the promise false without any
 * page changing. The pricing console warns instead.
 *
 * Pure, so the rule is tested without the database.
 */

export interface FeeGroupFacts {
  name: string;
  is_active: boolean;
  value_percentage: number;
  value_percentage_high: number | null;
}

export interface FeePromiseBreak {
  group: string;
  /** The rate that differs from the default (the base or the high tier). */
  percentage: number;
}

/** Active groups whose fee is not the default. Empty when the promise holds. */
export function feePromiseBreaks(groups: readonly FeeGroupFacts[], defaultPct: number | null | undefined): FeePromiseBreak[] {
  if (defaultPct == null || !Number.isFinite(defaultPct)) return [];
  const same = (a: number) => Math.abs(a - defaultPct) < 1e-9;
  const out: FeePromiseBreak[] = [];
  for (const group of groups) {
    if (!group.is_active) continue;
    if (!same(group.value_percentage)) out.push({ group: group.name, percentage: group.value_percentage });
    else if (group.value_percentage_high != null && !same(group.value_percentage_high)) {
      out.push({ group: group.name, percentage: group.value_percentage_high });
    }
  }
  return out;
}
