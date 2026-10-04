/**
 * The public tracking lookup's rules (086), pure so every one is tested.
 *
 * WHICH NUMBER. The only number a customer sees or searches by is Tomame's own:
 * the order reference `TM-00042` (`orders.order_no`, 050). Carrier, store,
 * airline and forwarder numbers (inbound UPS/USPS/FedEx/TBA, the outbound air
 * waybill on `warehouse_packages`) are internal to the warehouse and admin, and
 * nothing here accepts or returns one.
 *
 * THE SECURITY DECISION. That reference is `TM-` + a five-digit SEQUENCE: short,
 * monotonic and trivially enumerable. So a reference alone buys only COARSE
 * status: which of the five stops the parcel is at, the stage label and the
 * delivery window. No product, no picture, no per-stop dates or places. That
 * tells a stranger that order 42 exists and is in the air, and nothing about who
 * bought what.
 *
 * FULL detail (product, picture, timeline) needs one of:
 *  - a second factor: the last four digits of a phone on the order (the
 *    checkout snapshot, the saved address it used, or the profile), or the
 *    account's email. Limits, from `config/security.ts`: 8 attempts an hour per
 *    reference per address, and 20 WRONG answers an hour per reference from
 *    every address combined. 10,000 endings at 20 an hour is ten days for an
 *    even chance and three weeks to cover them all, longer than a parcel is in
 *    transit.
 *    Only wrong answers count toward the shared ceiling, so a stranger's
 *    guesses can at worst lock the reference's second factor for the rest of
 *    the hour; the owner can always sign in instead;
 *  - being the signed-in owner.
 *
 * Even full detail carries no name, address, phone, email, price, payment or
 * carrier number. The `detail` column of an event (payment channel, "Signed by
 * <name>") is never read for this page.
 */

import type { OrderEventKind } from "@/db/queries/order-events";
import { journeyStageFor, type JourneyTone } from "@/features/orders/services/journey-stage";
import { deriveJourneyTrack, type JourneyTrack } from "@/features/orders/services/journey-track";
import type { JourneyEta } from "@/features/journeys/types";

// ── The query ───────────────────────────────────────────────────────────────

export type TrackingQuery = { kind: "reference"; orderNo: string } | { kind: "invalid" };

/**
 * "tm 42", "TM-00042", "tm00042", "#TM-00042", "Order TM-42.", "TM-000042" →
 * TM-00042. Surrounding punctuation, a leading "#" or the word "order", and
 * extra leading zeros are forgiven; the number is re-padded to the five digits
 * `orders.order_no` is written with (050: `lpad(n, 5, '0')`). Anything else (a
 * carrier number included) is not a Tomame number and is answered "not found".
 */
export function classifyTrackingQuery(raw: string): TrackingQuery {
  if (raw.length > 120) return { kind: "invalid" };
  const trimmed = raw
    .toUpperCase()
    .replace(/^[\s"'`.,:;!?()[\]{}<>*_~#-]+|[\s"'`.,:;!?()[\]{}<>*_~#-]+$/g, "")
    .replace(/^ORDER\b[\s:#.-]*/, "");
  const compact = trimmed.replace(/[\s#._-]+/g, "");
  if (!compact || compact.length > 80) return { kind: "invalid" };
  const digits = compact.match(/^TM(\d{1,12})$/)?.[1]?.replace(/^0+/, "");
  if (!digits || digits.length > 8) return { kind: "invalid" };
  return { kind: "reference", orderNo: `TM-${digits.padStart(5, "0")}` };
}

/** Client-safe: does this look like a Tomame number worth sending to /track? */
export function looksLikeTomameNumber(raw: string): boolean {
  return classifyTrackingQuery(raw).kind === "reference";
}

// ── The second factor ───────────────────────────────────────────────────────

export type Verifier = { kind: "phone_last4"; digits: string } | { kind: "email"; email: string };

/**
 * An email, or a phone number of which only the last four digits are compared:
 * "0192", "024 555 0192" and "+233 24 555 0192" all read as 0192. Fewer than
 * four digits, or anything with letters in it, is no verifier at all, and the
 * service does not count it as an attempt.
 */
export function parseVerifier(raw: string | null | undefined): Verifier | null {
  const value = raw?.trim() ?? "";
  if (!value) return null;
  if (value.includes("@")) {
    const email = value.toLowerCase();
    return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { kind: "email", email } : null;
  }
  if (!/^[\d\s()+.-]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 && digits.length <= 15 ? { kind: "phone_last4", digits: digits.slice(-4) } : null;
}

export function verifierMatches(
  verifier: Verifier,
  onFile: { phones: readonly string[]; email: string | null },
): boolean {
  if (verifier.kind === "email") {
    return !!onFile.email && onFile.email.trim().toLowerCase() === verifier.email;
  }
  return onFile.phones.some((phone) => {
    const digits = phone.replace(/\D/g, "");
    return digits.length >= 4 && digits.slice(-4) === verifier.digits;
  });
}

// ── The response ────────────────────────────────────────────────────────────

export interface PublicTrackingUpdate {
  kind: string;
  title: string;
  location: string | null;
  weight_lbs: number | null;
  occurred_at: string;
}

interface PublicTrackingBase {
  found: true;
  reference: string;
  status: string;
  stageLabel: string;
  tone: JourneyTone;
  track: JourneyTrack;
  eta: JourneyEta | null;
}

/**
 * Why a second factor that was given did not unlock the full view. Each one is
 * worded differently on the page: a lockout or our own outage must never read
 * as "that does not match".
 *  - `mismatch`: checked, and wrong.
 *  - `limited`: too many tries; not checked. `retryInMinutes` is null when the
 *    reset time is unknown.
 *  - `no_phone_on_file`: phone digits given, but the order has no phone to
 *    compare them with. Steer to the email or to signing in.
 *  - `invalid`: not an email and not at least four digits. Not counted.
 *  - `error`: we could not read what is on file.
 */
export type VerifyOutcome =
  | { kind: "mismatch" }
  | { kind: "limited"; retryInMinutes: number | null }
  | { kind: "no_phone_on_file" }
  | { kind: "invalid" }
  | { kind: "error" };

export interface PublicTrackingCoarse extends PublicTrackingBase {
  detail: "coarse";
  /** Set when a verifier was given and did not unlock the full view. */
  verify: VerifyOutcome | null;
}

export interface PublicTrackingFull extends PublicTrackingBase {
  detail: "full";
  product: { name: string; imageUrl: string | null; store: string | null };
  updates: PublicTrackingUpdate[];
  /** The signed-in owner's own order page. Null for everyone else. */
  ownerHref: string | null;
}

export type PublicTrackingResult = { found: false } | PublicTrackingCoarse | PublicTrackingFull;

/** The one not-found answer, whatever the reason: bad format, no order, ambiguous number. */
export const TRACKING_NOT_FOUND: PublicTrackingResult = Object.freeze({ found: false });

export interface ShapeInput {
  order: {
    id: string;
    order_no: string;
    status: string;
    product_name: string | null;
    product_image_url: string | null;
    delivered_at: string | null;
  };
  eta: JourneyEta | null;
  store: string | null;
  events: readonly PublicTrackingUpdate[];
}

/**
 * Build the response. Fields are COPIED one by one into fresh objects, never
 * spread from a row, so a column added to a query later cannot leak through.
 */
export function shapePublicTracking(
  input: ShapeInput,
  level: "coarse" | "full",
  extras: { ownerHref?: string | null; verify?: VerifyOutcome | null } = {},
): PublicTrackingCoarse | PublicTrackingFull {
  const { order } = input;
  const stage = journeyStageFor(order.status);
  const events = input.events.map((e) => ({
    kind: e.kind as OrderEventKind,
    title: e.title,
    detail: null,
    location: level === "full" ? e.location : null,
    weight_lbs: level === "full" ? e.weight_lbs : null,
    occurred_at: e.occurred_at,
  }));
  const track = deriveJourneyTrack({
    status: order.status,
    events,
    etaFrom: input.eta?.from ?? null,
    etaTo: input.eta?.to ?? null,
    deliveredAt: order.delivered_at,
  });
  const base: PublicTrackingBase = {
    found: true,
    reference: order.order_no,
    status: order.status,
    stageLabel: stage.label,
    tone: stage.tone,
    track:
      level === "full"
        ? track
        : {
            ...track,
            // Which stop, never when or where: a timestamp per stop is a
            // timeline, and a timeline is the full view.
            stops: track.stops.map((s) => ({ ...s, at: null, note: null })),
          },
    eta: input.eta ? { from: input.eta.from, to: input.eta.to, source: input.eta.source } : null,
  };

  if (level === "coarse") return { ...base, detail: "coarse", verify: extras.verify ?? null };

  return {
    ...base,
    detail: "full",
    product: {
      name: order.product_name?.trim() || "Your item",
      imageUrl: httpsOnly(order.product_image_url),
      store: input.store,
    },
    updates: input.events.map((e) => ({
      kind: e.kind,
      title: e.title,
      location: e.location,
      weight_lbs: e.weight_lbs,
      occurred_at: e.occurred_at,
    })),
    ownerHref: extras.ownerHref ?? null,
  };
}

function httpsOnly(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}
