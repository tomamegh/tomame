/** 111: how a departure is named on every screen: "Delta Cargo JFK → ACC · Wed 25 Nov". */
export interface DepartureLike {
  carrier: string;
  origin: string;
  destination: string;
  departs_at: string;
}

export function departureLine(d: DepartureLike | null | undefined): string | null {
  if (!d) return null;
  const at = Date.parse(d.departs_at);
  const day = Number.isFinite(at)
    ? new Date(at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
    : null;
  const route = d.origin && d.destination ? ` ${d.origin} → ${d.destination}` : "";
  return `${d.carrier}${route}${day ? ` · ${day}` : ""}`;
}
