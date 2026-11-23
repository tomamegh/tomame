import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PlanDeparture } from "@/features/journeys/delivery-plan";

/**
 * The facts a delivery plan is worked from (Fix 6): the store tracking linked to
 * each order (inbound_parcels, 086), the departure its package flew on (113), and
 * the departures ahead (111). No logic here.
 */
export interface DeliveryPlanFacts {
  storeTracking: Map<string, { registeredAt: string; arrivedAt: string | null }>;
  /** `hub_received` per order: the parcel is at the hub even when no store tracking was registered. */
  hubArrivedAt: Map<string, string>;
  shippedOn: Map<string, PlanDeparture>;
  departures: PlanDeparture[];
}

const DEPARTURE_COLUMNS = "id, carrier, origin, destination, departs_on, departs_at, cutoff_at";

export async function loadDeliveryPlanFacts(orderIds: readonly string[]): Promise<DeliveryPlanFacts> {
  const db = createAdminClient();
  const ids = [...new Set(orderIds)];
  const facts: DeliveryPlanFacts = { storeTracking: new Map(), hubArrivedAt: new Map(), shippedOn: new Map(), departures: [] };
  if (ids.length === 0) return facts;

  const [links, items, upcoming, hubEvents] = await Promise.all([
    db.from("inbound_parcel_orders").select("order_id, parcel:inbound_parcels(created_at, arrived_at)").in("order_id", ids),
    db.from("warehouse_package_items").select("order_id, package:warehouse_packages(status, departure_id, shipped_at, carrier)").in("order_id", ids),
    db
      .from("flight_departures")
      .select(DEPARTURE_COLUMNS)
      .in("status", ["scheduled", "closed"])
      .gte("departs_on", new Date(Date.now() - 86_400_000).toISOString().slice(0, 10))
      .order("departs_at", { ascending: true })
      .limit(20),
    db.from("order_events").select("order_id, occurred_at").eq("kind", "hub_received").in("order_id", ids),
  ]);
  if (hubEvents.error) throw new Error(`Failed to load hub arrivals: ${hubEvents.error.message}`);
  for (const row of (hubEvents.data ?? []) as { order_id: string; occurred_at: string }[]) {
    const prev = facts.hubArrivedAt.get(row.order_id);
    if (!prev || row.occurred_at > prev) facts.hubArrivedAt.set(row.order_id, row.occurred_at);
  }
  if (links.error) throw new Error(`Failed to load store tracking: ${links.error.message}`);
  if (items.error) throw new Error(`Failed to load packages: ${items.error.message}`);
  if (upcoming.error) throw new Error(`Failed to load departures: ${upcoming.error.message}`);
  facts.departures = (upcoming.data ?? []) as PlanDeparture[];

  // The earliest registration and the latest arrival across an order's parcels.
  for (const row of (links.data ?? []) as unknown as { order_id: string; parcel: { created_at: string; arrived_at: string | null } | null }[]) {
    if (!row.parcel) continue;
    const prev = facts.storeTracking.get(row.order_id);
    facts.storeTracking.set(row.order_id, {
      registeredAt: prev && prev.registeredAt < row.parcel.created_at ? prev.registeredAt : row.parcel.created_at,
      arrivedAt: row.parcel.arrived_at ?? prev?.arrivedAt ?? null,
    });
  }

  const departureIds = new Map<string, string>();
  for (const row of (items.data ?? []) as unknown as { order_id: string | null; package: { status: string; departure_id: string | null; shipped_at: string | null; carrier: string | null } | null }[]) {
    if (!row.order_id || row.package?.status !== "shipped") continue;
    if (row.package.departure_id) departureIds.set(row.order_id, row.package.departure_id);
    else if (row.package.shipped_at) {
      // Shipped before departures were recorded (113): the package's own ship date is the flight.
      facts.shippedOn.set(row.order_id, {
        carrier: row.package.carrier?.trim() || "Delta Cargo",
        origin: "JFK",
        destination: "ACC",
        departs_on: row.package.shipped_at.slice(0, 10),
        departs_at: row.package.shipped_at,
        cutoff_at: row.package.shipped_at,
      });
    }
  }
  if (departureIds.size > 0) {
    const { data, error } = await db.from("flight_departures").select(DEPARTURE_COLUMNS).in("id", [...new Set(departureIds.values())]);
    if (error) throw new Error(`Failed to load flown departures: ${error.message}`);
    const byId = new Map(((data ?? []) as (PlanDeparture & { id: string })[]).map((d) => [d.id, d]));
    for (const [orderId, depId] of departureIds) {
      const d = byId.get(depId);
      if (d) facts.shippedOn.set(orderId, d);
    }
  }
  return facts;
}
