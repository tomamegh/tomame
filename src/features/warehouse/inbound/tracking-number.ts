/**
 * Store and carrier tracking numbers, as a scanner or a thumb produces them (086).
 *
 * Pure and framework-free: the warehouse service, the public lookup and their
 * tests all read it.
 *
 * WHAT A SCAN LOOKS LIKE. A handheld scanner is a keyboard, and a carrier label
 * carries more than the number printed under it:
 *  - USPS labels encode GS1 Application Identifier 420 + the destination ZIP
 *    before the tracking number: `420` + `10001` (or `100011234`) + `9400…`.
 *    Some scanners also pass the FNC1 separator (ASCII 29) or a `]C1`
 *    symbology prefix.
 *  - FedEx Ground's 1D barcode is 34 digits; the tracking number is the last 12
 *    (or, for older SmartPost labels, the last 15/20/22).
 *  - Everything else (UPS 1Z…, Amazon TBA…, DHL, Royal Mail) scans as printed.
 *
 * So a scan becomes a canonical KEY (what is stored) plus CANDIDATES (every key
 * the scan could also mean), and a match on any candidate is a match.
 *
 * The key's shape must equal `public.tracking_key()` in 086: upper case,
 * letters and digits only.
 */

export type InboundCarrier =
  | "amazon"
  | "ups"
  | "usps"
  | "fedex"
  | "dhl"
  | "ontrac"
  | "royal_mail"
  | "other";

export interface NormalisedTracking {
  /** The canonical key: what is stored and shown. */
  key: string;
  /** Every key this scan might mean, `key` first. Deduplicated. */
  candidates: string[];
  /** A guess from the shape. For the operator's eye, never for a decision. */
  carrier: InboundCarrier;
}

export const TRACKING_KEY_MIN = 8;
export const TRACKING_KEY_MAX = 40;

/** `public.tracking_key()` in TypeScript: upper case, letters and digits only. */
export function trackingKey(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * USPS IMpb: `420` + 5- or 9-digit ZIP + the tracking number (20–22 digits that
 * start 91–95, or 26/30/34 for the long forms). The ZIP's length is not marked,
 * so both readings are tried and the one that leaves a USPS-shaped number wins;
 * when both do, both become candidates.
 */
function stripUspsRouting(key: string): string[] {
  if (!/^420\d{13,}$/.test(key)) return [];
  const out: string[] = [];
  for (const zip of [9, 5]) {
    const rest = key.slice(3 + zip);
    if (/^9[1-5]\d{18,32}$/.test(rest)) out.push(rest);
  }
  return out;
}

/** FedEx's 34-digit (and 32-digit) barcode: the tracking number is its tail. */
function fedexTails(key: string): string[] {
  if (!/^\d{32,34}$/.test(key)) return [];
  return [key.slice(-12), key.slice(-15)];
}

export function detectCarrier(key: string): InboundCarrier {
  if (/^1Z[0-9A-Z]{16}$/.test(key)) return "ups";
  if (/^TBA\d{9,15}$/.test(key)) return "amazon";
  if (/^9[1-5]\d{18,32}$/.test(key)) return "usps";
  if (/^(EA|EC|CP|LN|LZ|RA|RB|RR|LX)\d{9}US$/.test(key)) return "usps";
  if (/^[A-Z]{2}\d{9}GB$/.test(key)) return "royal_mail";
  if (/^(JJD|JVGL|GM|LX|RX)[0-9A-Z]{8,}$/.test(key) || /^\d{10}$/.test(key)) return "dhl";
  if (/^[CD]\d{14}$/.test(key)) return "ontrac";
  if (/^(\d{12}|\d{15}|\d{20}|\d{22})$/.test(key)) return "fedex";
  return "other";
}

/**
 * Normalise a scanned or typed tracking number. Null when there is nothing a
 * parcel could be tracked by: empty, too short to be unique, or absurdly long.
 */
export function normaliseTracking(raw: string): NormalisedTracking | null {
  // The FNC1 separator and the AIM symbology identifier are scanner framing.
  const cleaned = raw.replaceAll(String.fromCharCode(29), "").trim().replace(/^\][A-Za-z]\d/, "");
  const base = trackingKey(cleaned);
  if (base.length < TRACKING_KEY_MIN || base.length > 60) return null;

  const usps = stripUspsRouting(base);
  const fedex = fedexTails(base);
  // The canonical key is what the printed label says under the barcode.
  const key = usps[0] ?? (fedex.length ? fedex[0]! : base);
  if (key.length > TRACKING_KEY_MAX) return null;

  const candidates = [...new Set([key, base, ...usps, ...fedex])].filter(
    (c) => c.length >= TRACKING_KEY_MIN && c.length <= 60,
  );
  return { key, candidates, carrier: detectCarrier(key) };
}

/** "1Z999AA10123456784" → "1Z 999A A101 2345 6784": readable aloud, not parsed again. */
export function formatTracking(key: string): string {
  if (/^1Z/.test(key) && key.length === 18) {
    return `${key.slice(0, 2)} ${key.slice(2, 5)} ${key.slice(5, 8)} ${key.slice(8, 10)} ${key.slice(10, 14)} ${key.slice(14)}`;
  }
  if (/^TBA/.test(key)) return key;
  if (/^\d+$/.test(key) && key.length > 12) return key.replace(/(\d{4})(?=\d)/g, "$1 ");
  return key;
}

export const CARRIER_LABELS: Record<InboundCarrier, string> = {
  amazon: "Amazon Logistics",
  ups: "UPS",
  usps: "USPS",
  fedex: "FedEx",
  dhl: "DHL",
  ontrac: "OnTrac",
  royal_mail: "Royal Mail",
  other: "Carrier",
};
