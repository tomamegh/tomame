import type { RegionRow, RegionStatus } from "@/db/queries/regions";

/**
 * Pure display helpers for the Where-we-buy hero map.
 *
 * The arc geometry is the designer's, not the database's — `design/Tomame -
 * Marketing v2.dc.html` #mk-regions draws three fixed cubics into Accra. Only
 * the *labels* and the live/soon state come from `regions`, so a lane that is
 * added or flipped live in the admin moves the map without a code change; a
 * lane with no drawn arc is simply left off the graphic.
 */

export interface LaneMapNode {
  code: string;
  /** Regional-indicator flag, or an empty string when the code is unknown. */
  flag: string;
  /** `regions.hub_city`, falling back to the region name. */
  city: string;
  /** "14–18 d" for a live lane, "coming soon" otherwise. */
  detail: string;
  status: RegionStatus;
  /** The cubic this lane flies, in the 600×440 stage's user units. */
  path: string;
  /** Label anchor in stage units. */
  x: number;
  y: number;
}

interface LaneGeometry {
  path: string;
  x: number;
  y: number;
}

/** Stage geometry copied verbatim from the mock's `#rUS` / `#rUK` / `#rCN`. */
const LANE_GEOMETRY: Readonly<Record<string, LaneGeometry>> = {
  USA: { path: "M110 130 C 250 40, 380 120, 430 330", x: 115, y: 106 },
  UK: { path: "M300 90 C 380 120, 420 220, 430 330", x: 300, y: 66 },
  // Nudged right and down from the mock's 470/96: the label is right-anchored
  // so it cannot clip the card edge, which would otherwise slide it back into
  // the London label.
  CHINA: { path: "M520 120 C 520 220, 480 300, 430 330", x: 595, y: 106 },
};

const REGION_FLAG: Readonly<Record<string, string>> = {
  USA: "🇺🇸",
  UK: "🇬🇧",
  CHINA: "🇨🇳",
};

/** Short label the headline uses: "USA", "UK", "China" — never "United States of…". */
const REGION_SHORT_NAME: Readonly<Record<string, string>> = {
  USA: "USA",
  UK: "UK",
  CHINA: "China",
};

export const GHANA_FLAG = "🇬🇭";

export function regionFlag(code: string): string {
  return REGION_FLAG[code] ?? "";
}

export function regionShortName(region: RegionRow): string {
  return REGION_SHORT_NAME[region.code] ?? region.name;
}

/** "14–18 days", "14 days", or null when the lane has no published band. */
export function transitBand(region: RegionRow, unit = "days"): string | null {
  const { transit_days_min: min, transit_days_max: max } = region;
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return `${min}–${max} ${unit}`;
  return `${min ?? max} ${unit}`;
}

/**
 * Regions → map nodes, dropping any lane the design has no arc for and any
 * lane an admin has switched `off`.
 */
export function buildLaneMapNodes(
  regions: readonly RegionRow[],
): LaneMapNode[] {
  const nodes: LaneMapNode[] = [];
  for (const region of regions) {
    const geometry = LANE_GEOMETRY[region.code];
    if (region.status === "off" || !geometry) continue;
    nodes.push({
      code: region.code,
      flag: regionFlag(region.code),
      city: region.hub_city ?? region.name,
      detail:
        region.status === "live"
          ? (transitBand(region, "d") ?? "open")
          : "coming soon",
      status: region.status,
      path: geometry.path,
      x: geometry.x,
      y: geometry.y,
    });
  }
  return nodes;
}
