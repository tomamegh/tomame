/**
 * Weight truth for the US hub (site brief, Fix 11). Pure, no I/O, so the board,
 * the package bench, the label and the services all read one set of rules.
 *
 * - An item's weight is the scale's when it was weighed on arrival (confirmed),
 *   else its listing's (an estimate), else unknown. Unknown is never 0 lb: it is
 *   flagged, and a package holding one cannot be sealed until it is weighed.
 * - A package is confirmed when the whole package went on the scale, or when
 *   every item in it was weighed on arrival. Otherwise its weight is the sum of
 *   its items, an estimate, and it seals only with a reason
 *   (`weight_estimate_reason`).
 * - An air package has the box capacity (`pricing_constants.box_capacity_lbs`).
 *   Fill is the true percentage: 141.2 lb in a 9 lb box is 1569% and 132.2 lb
 *   over, never "100% · 0 lb spare". Going over needs a reason
 *   (`capacity_override_reason`).
 * - An item heavier than a box on its own is oversize freight: it ships in a
 *   package by itself and nothing else goes in with it.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Same output as `formatLbs` in components/format.ts; kept here so this module has no imports. */
export function lbs(value: number): string {
  return `${value.toFixed(2).replace(/\.?0+$/, "") || "0"} lb`;
}

export type WeightSource = "scale" | "listed" | "none";

export interface WeighableItem {
  order_no?: string;
  title?: string;
  quantity: number;
  /** Per unit, from the listing. */
  listed_weight_lbs: number | null;
  /** The arrival scan; its weight covers the whole parcel (every unit). */
  received: { weight_lbs: number | null } | null;
}

export interface ItemWeight {
  /** The whole line: the scale reading, or the listed unit weight × quantity. */
  lbs: number | null;
  source: WeightSource;
}

export function itemWeight(item: WeighableItem, quantity: number = item.quantity): ItemWeight {
  const scale = item.received?.weight_lbs;
  if (scale != null && scale > 0) return { lbs: r2(scale), source: "scale" };
  const listed = item.listed_weight_lbs;
  if (listed != null && listed > 0) return { lbs: r2(listed * Math.max(1, quantity)), source: "listed" };
  return { lbs: null, source: "none" };
}

export type WeightTone = "confirmed" | "estimate" | "over" | "missing";

export interface WeightNote {
  text: string;
  tone: WeightTone;
}

/**
 * One line for an item's row: weighed, listed only, unknown, or oversize.
 * `capacityLbs` null (sea freight, or no capacity set) skips the oversize check.
 */
export function weightNote(item: WeighableItem, capacityLbs: number | null): WeightNote {
  const w = itemWeight(item);
  if (w.lbs == null) return { text: "No weight: weigh it before it is packed", tone: "missing" };
  if (isOversize(w.lbs, capacityLbs)) {
    return { text: `${lbs(w.lbs)}${w.source === "listed" ? " listed" : ""}: over a ${lbs(capacityLbs!)} box, ships as oversize freight`, tone: "over" };
  }
  if (w.source === "scale") return { text: `${lbs(w.lbs)} weighed`, tone: "confirmed" };
  return { text: `~${lbs(w.lbs)} listed, not weighed yet`, tone: "estimate" };
}

export function isOversize(weightLbs: number | null, capacityLbs: number | null): boolean {
  return weightLbs != null && capacityLbs != null && capacityLbs > 0 && weightLbs > capacityLbs;
}

export interface CapacityFill {
  /** The true percentage, uncapped. Null when there is no capacity. */
  pct: number | null;
  spareLbs: number;
  overLbs: number;
  over: boolean;
}

export function capacityFill(weightLbs: number, capacityLbs: number | null): CapacityFill {
  if (capacityLbs == null || !(capacityLbs > 0)) return { pct: null, spareLbs: 0, overLbs: 0, over: false };
  const w = r2(Math.max(0, weightLbs));
  return {
    pct: Math.round((w / capacityLbs) * 100),
    spareLbs: r2(Math.max(0, capacityLbs - w)),
    overLbs: r2(Math.max(0, w - capacityLbs)),
    over: w > capacityLbs,
  };
}

/** "3.2 of 9 lb · 5.8 lb spare" or "141.2 of 9 lb · 132.2 lb over". */
export function capacityLine(weightLbs: number, capacityLbs: number | null): string | null {
  const fill = capacityFill(weightLbs, capacityLbs);
  if (fill.pct == null) return null;
  const of = `${lbs(r2(weightLbs)).replace(/ lb$/, "")} of ${lbs(capacityLbs!)}`;
  return fill.over ? `${of} · ${lbs(fill.overLbs)} over` : `${of} · ${lbs(fill.spareLbs)} spare`;
}

export interface LoadLine {
  quantity: number;
  description: string | null;
  item: WeighableItem | null;
}

export interface PackageLoad {
  capacityLbs: number | null;
  /** Sum of the items' known weights. */
  contentsLbs: number;
  /** The whole package on the scale. */
  weighedLbs: number | null;
  /** What the package counts as: the scale's, else the contents. */
  lbs: number;
  /** A scale stands behind the figure: the package itself, or every item in it. */
  confirmed: boolean;
  confirmedBy: "package" | "items" | null;
  fill: CapacityFill;
  /** Lines nobody can put a weight on: order numbers, or the typed description. */
  missing: string[];
  /** Items whose weight is only the listing's. */
  estimateCount: number;
  /** A single item heavier than the box: the oversize freight path. */
  oversize: boolean;
  /** Oversize items in a package with other things. */
  oversizeMixed: string[];
  lineCount: number;
}

function lineName(line: LoadLine): string {
  return line.item?.order_no ?? line.item?.title ?? line.description ?? "An item";
}

export function packageLoad(
  pkg: { weight_lbs: number | null; lines: readonly LoadLine[] },
  capacityLbs: number | null,
): PackageLoad {
  let contents = 0;
  const missing: string[] = [];
  const oversized: string[] = [];
  let estimateCount = 0;
  let scaleCount = 0;
  for (const line of pkg.lines) {
    // A typed line (something outside the order system) has no weight on record; the package scale covers it.
    if (!line.item) continue;
    const w = itemWeight(line.item, line.quantity);
    if (w.lbs == null) missing.push(lineName(line));
    else {
      contents += w.lbs;
      if (w.source === "listed") estimateCount += 1;
      else scaleCount += 1;
      if (isOversize(w.lbs, capacityLbs)) oversized.push(lineName(line));
    }
  }
  contents = r2(contents);
  const weighed = pkg.weight_lbs != null && pkg.weight_lbs > 0 ? r2(pkg.weight_lbs) : null;
  const total = weighed ?? contents;
  const single = pkg.lines.length === 1;
  const itemsWeighed = pkg.lines.length > 0 && scaleCount === pkg.lines.length;
  const confirmedBy = weighed != null ? "package" : itemsWeighed ? "items" : null;
  return {
    capacityLbs,
    contentsLbs: contents,
    weighedLbs: weighed,
    lbs: total,
    confirmed: confirmedBy != null,
    confirmedBy,
    fill: capacityFill(total, capacityLbs),
    missing,
    estimateCount,
    oversize: single && oversized.length === 1,
    oversizeMixed: single ? [] : oversized,
    lineCount: pkg.lines.length,
  };
}

const listed = (names: string[]) =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

export interface SealOverrides {
  /** Seal on the estimate: why the package was not weighed. */
  estimateReason?: string | null;
  /** Seal over the box capacity: why it was not split. */
  capacityReason?: string | null;
}

/**
 * Why a package cannot be sealed as it is, or null. An unknown item weight has no
 * override (weigh it); an estimate or an over-capacity package seals with a reason.
 */
export function sealWeightProblem(load: PackageLoad, overrides: SealOverrides = {}): string | null {
  if (load.missing.length > 0) {
    const n = load.missing.length;
    return `${listed(load.missing)} ${n === 1 ? "has" : "have"} no weight. Weigh ${n === 1 ? "it" : "them"} first (Receive → weight), then seal.`;
  }
  if (load.oversizeMixed.length > 0 && !overrides.capacityReason?.trim()) {
    return `${listed(load.oversizeMixed)} ${load.oversizeMixed.length === 1 ? "is" : "are"} heavier than a ${lbs(load.capacityLbs!)} box and must ship on ${load.oversizeMixed.length === 1 ? "its" : "their"} own as oversize freight. Take ${load.oversizeMixed.length === 1 ? "it" : "them"} out, or seal with a reason.`;
  }
  if (load.fill.over && !load.oversize && load.oversizeMixed.length === 0 && !overrides.capacityReason?.trim()) {
    return `This package is ${lbs(load.lbs)}, ${lbs(load.fill.overLbs)} over the ${lbs(load.capacityLbs!)} box. Split it, or seal with a reason.`;
  }
  if (!load.confirmed && !overrides.estimateReason?.trim()) {
    return "Weigh the package on the scale and enter the weight, or seal on the estimate with a reason.";
  }
  return null;
}

/**
 * Why these items cannot go into this package without a reason, or null.
 * Unknown weights are allowed in (they are flagged, and block the seal).
 */
export function addItemsWeightProblem(
  current: PackageLoad,
  incoming: readonly LoadLine[],
  overrideReason?: string | null,
): string | null {
  if (overrideReason?.trim() || current.capacityLbs == null) return null;
  const cap = current.capacityLbs;
  const weights = incoming.map((line) => ({ line, w: line.item ? itemWeight(line.item, line.quantity).lbs : null }));
  const oversize = weights.filter(({ w }) => isOversize(w, cap)).map(({ line }) => lineName(line));
  const packageWillHoldOthers = current.lineCount + incoming.length > 1;

  if (current.oversize && incoming.length > 0) {
    return `This package holds an oversize item on its own. Start another package, or give a reason.`;
  }
  if (oversize.length > 0 && packageWillHoldOthers) {
    return `${listed(oversize)} ${oversize.length === 1 ? "is" : "are"} over a ${lbs(cap)} box. Pack ${oversize.length === 1 ? "it" : "each"} in a package on ${oversize.length === 1 ? "its" : "their"} own as oversize freight, or give a reason.`;
  }
  if (oversize.length > 0) return null;
  const after = r2(current.contentsLbs + weights.reduce((acc, { w }) => acc + (w ?? 0), 0));
  if (after > cap) {
    return `That makes ${lbs(after)}, ${lbs(r2(after - cap))} over the ${lbs(cap)} box. Start another package, or give a reason.`;
  }
  return null;
}
