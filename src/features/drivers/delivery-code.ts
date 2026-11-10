import { randomInt, timingSafeEqual } from "node:crypto";

/**
 * The delivery code (102), the pure half: make one, read one back, compare.
 * Server only by nature (node:crypto), but no database, so it is unit tested.
 */

/** Wrong tries before the code locks and staff have to step in. */
export const MAX_CODE_FAILURES = 5;

/** Six random digits, leading zeros kept. */
export function generateDeliveryCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** What a driver typed, as six digits, or null. "482 913" and "482-913" are fine. */
export function normaliseCodeInput(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}

/** Constant-time: a wrong guess takes as long as a right one. */
export function codesMatch(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** "482 913" — how the customer reads it out. */
export function formatDeliveryCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}
