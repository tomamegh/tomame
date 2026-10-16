import "server-only";

import { pingDatabase } from "@/db/queries/health";
import { logger } from "@/lib/logger";

/** Longer than a healthy read by two orders of magnitude, shorter than a page's patience. */
export const READINESS_DB_TIMEOUT_MS = 5000;

export interface Readiness {
  ok: boolean;
  database: { ok: boolean; ms: number; error?: string };
}

/**
 * A public route must not be a lever on the database: within this window an
 * instance answers from its last check instead of reading again.
 */
export const READINESS_REUSE_MS = 5000;

let last: { at: number; readiness: Promise<Readiness> } | null = null;

/**
 * Whether the app can serve a page that reads data. `/api/health` answers 200
 * from the function alone, and it kept answering 200 through the 2026-10-16
 * outage while every page that read the database returned 500 — this is the
 * check an external monitor watches instead.
 */
export function checkReadiness(now: number = Date.now()): Promise<Readiness> {
  if (last && now - last.at < READINESS_REUSE_MS) return last.readiness;
  last = { at: now, readiness: readDatabase() };
  return last.readiness;
}

async function readDatabase(): Promise<Readiness> {
  const started = Date.now();
  try {
    await pingDatabase(READINESS_DB_TIMEOUT_MS);
    return { ok: true, database: { ok: true, ms: Date.now() - started } };
  } catch (error) {
    const database = { ok: false, ms: Date.now() - started, error: error instanceof Error ? error.message : String(error) };
    logger.warn("readiness: database read failed", database);
    return { ok: false, database };
  }
}
