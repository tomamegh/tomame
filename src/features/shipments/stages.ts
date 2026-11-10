/**
 * Shipment stages (098) — the steps a parcel walks from payment to the door,
 * and the one place an order's events become "done / current / next".
 *
 * Pure and framework-free, on the same contract as `journey-stage.ts`: imported
 * by the server services and by client components alike.
 *
 * THE ORDER STATUS IS UNTOUCHED. Every step between leaving the US hub and
 * delivery is `in_transit`; the steps are `order_events` rows (migration 098).
 * A step is reached when its event exists, or when the status alone proves it
 * (a `delivered` order has been through every step whether or not each leg was
 * logged). An event can move a parcel AHEAD of its status, never behind it.
 */

// ── The steps ───────────────────────────────────────────────────────────────

/** Every step a stage setting exists for, in walking order. */
export const SHIPMENT_STAGE_KEYS = [
  "paid",
  "purchased",
  "hub_received",
  "departed",
  "arrived_country",
  "ghana_warehouse",
  "ready_for_pickup",
  "out_for_delivery",
  "delivered",
] as const;

export type ShipmentStageKey = (typeof SHIPMENT_STAGE_KEYS)[number];

/**
 * The steps staff move a package or an order INTO from the warehouse. `departed`
 * is not here: a package departs by being shipped (seal → ship), which also moves
 * its orders to `in_transit`. Pickup and delivery are alternatives for one step.
 */
export const MOVABLE_STAGES = [
  "arrived_country",
  "ghana_warehouse",
  "ready_for_pickup",
  "out_for_delivery",
  "delivered",
] as const;

export type MovableStage = (typeof MOVABLE_STAGES)[number];

/** Where a package can be once it has shipped. */
export type PackageStage = "departed" | MovableStage;

/** Rank on the walk. Pickup and delivery share a rank: either is the last mile. */
export const STAGE_RANK: Record<ShipmentStageKey, number> = {
  paid: 0,
  purchased: 1,
  hub_received: 2,
  departed: 3,
  arrived_country: 4,
  ghana_warehouse: 5,
  ready_for_pickup: 6,
  out_for_delivery: 6,
  delivered: 7,
};

/** How far a status alone carries an order. `in_transit` proves departure, nothing after. */
const STATUS_RANK: Record<string, number> = {
  pending: -1,
  paid: 0,
  processing: 1,
  in_transit: 3,
  delivered: 7,
  completed: 7,
};

/** Which step an event kind vouches for. `payment_received` and `purchased` keep their 050 names. */
const EVENT_STAGE: Record<string, ShipmentStageKey> = {
  payment_received: "paid",
  purchased: "purchased",
  hub_received: "hub_received",
  departed: "departed",
  arrived_country: "arrived_country",
  ghana_warehouse: "ghana_warehouse",
  ready_for_pickup: "ready_for_pickup",
  out_for_delivery: "out_for_delivery",
  delivered: "delivered",
  completed: "delivered",
};

export function isMovableStage(value: string): value is MovableStage {
  return (MOVABLE_STAGES as readonly string[]).includes(value);
}

export function isShipmentStage(value: string): value is ShipmentStageKey {
  return (SHIPMENT_STAGE_KEYS as readonly string[]).includes(value);
}

/** The step an event kind stands for, or null for notes, notices and photos. */
export function stageForEventKind(kind: string): ShipmentStageKey | null {
  return Object.hasOwn(EVENT_STAGE, kind) ? EVENT_STAGE[kind]! : null;
}

// ── Settings ────────────────────────────────────────────────────────────────

/** One row of `shipment_stage_settings`. */
export interface StageSetting {
  stage: ShipmentStageKey;
  title: string;
  description: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_whatsapp: boolean;
  contact_hours: string | null;
  typical_days: number | null;
}

/** The seed in 098, used when the table cannot be read. Wording only, no numbers. */
export const DEFAULT_STAGE_SETTINGS: Record<ShipmentStageKey, StageSetting> = {
  paid: blank("paid", "Order confirmed", "Payment received. Our buyers are placing your order with the store.", 2),
  purchased: blank("purchased", "Bought from the store", "The store is sending it to our US hub.", 7),
  hub_received: blank("hub_received", "At our US hub", "Checked, photographed and waiting for the next flight to Ghana.", 7),
  departed: blank("departed", "Dispatched to Ghana", "On its way to Accra.", 5),
  arrived_country: blank("arrived_country", "Arrived in Ghana", "Landed and clearing customs.", 3),
  ghana_warehouse: blank("ghana_warehouse", "Processing at our warehouse", "At our Accra warehouse, being sorted for delivery.", 2),
  ready_for_pickup: blank("ready_for_pickup", "Ready for pickup", "Waiting for you at the pickup point.", 7),
  out_for_delivery: blank("out_for_delivery", "Out for delivery", "With our rider and on the way to you.", 1),
  delivered: blank("delivered", "Delivered", "Delivered. Enjoy it!", null),
};

function blank(stage: ShipmentStageKey, title: string, description: string, typicalDays: number | null): StageSetting {
  return {
    stage,
    title,
    description,
    contact_name: null,
    contact_phone: null,
    contact_whatsapp: true,
    contact_hours: null,
    typical_days: typicalDays,
  };
}

/** Settings keyed by stage, with the defaults filling any row the table lacks. */
export function settingsByStage(rows: readonly StageSetting[]): Record<ShipmentStageKey, StageSetting> {
  const out = { ...DEFAULT_STAGE_SETTINGS };
  for (const row of rows) if (isShipmentStage(row.stage)) out[row.stage] = row;
  return out;
}

// ── Where an order is ───────────────────────────────────────────────────────

/** The subset of an `order_events` row this module reads. */
export interface StageEvent {
  kind: string;
  title: string;
  detail: string | null;
  location: string | null;
  occurred_at: string;
  contact_name?: string | null;
  contact_phone?: string | null;
  expected_on?: string | null;
}

/** The furthest rank an order has reached, -1 when unpaid or cancelled. */
export function reachedRank(status: string, events: readonly StageEvent[]): number {
  if (status === "cancelled") return -1;
  let rank = STATUS_RANK[status] ?? -1;
  for (const event of events) {
    const stage = stageForEventKind(event.kind);
    if (stage && STAGE_RANK[stage] > rank) rank = STAGE_RANK[stage];
  }
  return rank;
}

/** The furthest step an order has reached, by key, or null before payment. */
export function currentStageKey(status: string, events: readonly StageEvent[]): ShipmentStageKey | null {
  const rank = reachedRank(status, events);
  if (rank < 0) return null;
  // At the last mile the event says which of the two it was.
  if (rank === 6) {
    const last = latest(events, ["out_for_delivery", "ready_for_pickup"]);
    return (last?.kind as ShipmentStageKey | undefined) ?? "out_for_delivery";
  }
  const byRank = SHIPMENT_STAGE_KEYS.find((key) => STAGE_RANK[key] === rank);
  return byRank ?? null;
}

/**
 * The badge word for a parcel on its way: the leg ("Arrived in Ghana") once it
 * has left the hub, else the status label it already had. Lists pass the seed
 * wording rather than reading the settings table on every render.
 */
export function transitLabel(
  status: string,
  events: readonly StageEvent[],
  fallback: string,
  settings: Record<ShipmentStageKey, StageSetting> = DEFAULT_STAGE_SETTINGS,
): string {
  if (status !== "in_transit") return fallback;
  const current = currentStageKey(status, events);
  return current ? settings[current].title : fallback;
}

export interface Contact {
  name: string | null;
  phone: string;
  whatsapp: boolean;
  hours: string | null;
}

export interface ActiveNotice {
  message: string;
  expectedOn: string | null;
  at: string;
  contact: Contact | null;
}

export type StepState = "done" | "current" | "next";

export interface ProgressStep {
  key: ShipmentStageKey;
  title: string;
  /** The event's own words when staff wrote some, else the stage's description. */
  description: string;
  state: StepState;
  /** When the step happened. Null when nothing recorded it. */
  at: string | null;
  location: string | null;
  /** Who to call. Only on the current step. */
  contact: Contact | null;
  /** The step usually takes this long; past it with no notice, staff see "overdue". */
  typicalDays: number | null;
}

export interface ShipmentProgress {
  steps: ProgressStep[];
  current: ShipmentStageKey | null;
  /** A delay notice newer than the current step and not cleared. */
  notice: ActiveNotice | null;
  isCancelled: boolean;
  isComplete: boolean;
}

/**
 * The customer's progress list. `deliveryKind` picks the last-mile step before
 * either has happened: a pickup order is told "Ready for pickup", a door order
 * "Out for delivery". Total: never throws.
 */
export function deriveShipmentProgress(input: {
  status: string;
  events: readonly StageEvent[];
  settings: Record<ShipmentStageKey, StageSetting>;
  deliveryKind?: "door" | "pickup" | null;
}): ShipmentProgress {
  const { status, events, settings } = input;
  const isCancelled = status === "cancelled";
  const isComplete = status === "delivered" || status === "completed";
  const rank = reachedRank(status, events);
  const current = currentStageKey(status, events);

  const lastMile: ShipmentStageKey =
    current === "ready_for_pickup" || current === "out_for_delivery"
      ? current
      : input.deliveryKind === "pickup"
        ? "ready_for_pickup"
        : "out_for_delivery";

  const keys = SHIPMENT_STAGE_KEYS.filter(
    (key) => (key !== "ready_for_pickup" && key !== "out_for_delivery") || key === lastMile,
  );

  const steps = keys.map((key): ProgressStep => {
    const setting = settings[key];
    const event = latest(events, kindsFor(key));
    const state: StepState =
      isCancelled || rank < STAGE_RANK[key]
        ? "next"
        : rank > STAGE_RANK[key] || (isComplete && key === "delivered")
          ? "done"
          : "current";
    return {
      key,
      title: setting.title,
      description: event?.detail?.trim() || setting.description,
      state,
      at: event?.occurred_at ?? null,
      location: event?.location?.trim() || null,
      contact: state === "current" ? contactFor(event, setting) : null,
      typicalDays: setting.typical_days,
    };
  });

  const stepAt = current ? latest(events, kindsFor(current))?.occurred_at ?? null : null;
  return {
    steps,
    current,
    notice: isComplete || isCancelled ? null : activeNotice(events, stepAt, current ? settings[current] : null),
    isCancelled,
    isComplete,
  };
}

/** A notice is live when it is newer than both the current step and the last "back on track". */
export function activeNotice(
  events: readonly StageEvent[],
  stepAt: string | null,
  setting: StageSetting | null,
): ActiveNotice | null {
  const delay = latest(events, ["delay"]);
  if (!delay) return null;
  if (stepAt && delay.occurred_at < stepAt) return null;
  const cleared = latest(events, ["delay_cleared"]);
  if (cleared && cleared.occurred_at >= delay.occurred_at) return null;
  return {
    message: delay.detail?.trim() || delay.title,
    expectedOn: delay.expected_on ?? null,
    at: delay.occurred_at,
    contact: contactFor(delay, setting),
  };
}

/** The event's own contact first, then the stage's default. Null when neither has a number. */
function contactFor(event: StageEvent | null, setting: StageSetting | null): Contact | null {
  if (event?.contact_phone) {
    return { name: event.contact_name ?? null, phone: event.contact_phone, whatsapp: true, hours: null };
  }
  if (setting?.contact_phone) {
    return {
      name: setting.contact_name,
      phone: setting.contact_phone,
      whatsapp: setting.contact_whatsapp,
      hours: setting.contact_hours,
    };
  }
  return null;
}

function kindsFor(key: ShipmentStageKey): string[] {
  if (key === "paid") return ["payment_received"];
  if (key === "delivered") return ["delivered", "completed"];
  return [key];
}

function latest(events: readonly StageEvent[], kinds: readonly string[]): StageEvent | null {
  let best: StageEvent | null = null;
  for (const event of events) {
    if (!kinds.includes(event.kind)) continue;
    if (!best || event.occurred_at > best.occurred_at) best = event;
  }
  return best;
}

/** Whole days a step has been current, for the staff board's "overdue". */
export function daysSince(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null;
  const ms = now.getTime() - Date.parse(iso);
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 86_400_000)) : null;
}

/** `tel:` and `wa.me` links for a contact's E.164 number. */
export function telHref(phone: string): string {
  return `tel:${phone}`;
}

export function whatsappContactHref(phone: string, text?: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

// ── Staff helpers ───────────────────────────────────────────────────────────

/**
 * The step a package or order most likely goes to next. The last mile picks
 * pickup only when everyone in it collects; a mixed carton goes out for delivery.
 */
export function nextMovableStage(
  current: ShipmentStageKey | null,
  allPickup = false,
): MovableStage | null {
  switch (current) {
    case "departed":
      return "arrived_country";
    case "arrived_country":
      return "ghana_warehouse";
    case "ghana_warehouse":
      return allPickup ? "ready_for_pickup" : "out_for_delivery";
    case "ready_for_pickup":
    case "out_for_delivery":
      return "delivered";
    default:
      return null;
  }
}

/** Short words for the staff board; the customer's wording lives in the settings. */
export const STAFF_STAGE_LABEL: Record<ShipmentStageKey, string> = {
  paid: "Paid",
  purchased: "Purchased",
  hub_received: "At US hub",
  departed: "Dispatched",
  arrived_country: "In customs",
  ghana_warehouse: "Accra warehouse",
  ready_for_pickup: "Ready for pickup",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
};

/** Where a step usually happens, to prefill the "Where" box. */
export const STAGE_DEFAULT_LOCATION: Partial<Record<MovableStage, string>> = {
  arrived_country: "Kotoka Airport, Accra",
  ghana_warehouse: "Accra warehouse",
};
