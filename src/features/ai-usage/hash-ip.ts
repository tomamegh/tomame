import "server-only";

import { createHash } from "node:crypto";

/** A stable, short, one-way tag for a visitor's IP: enough to group abuse, never the address. */
export function hashIp(ip: string | null | undefined): string | null {
  const value = ip?.trim();
  if (!value || value === "unknown") return null;
  const salt = process.env.SUPABASE_SECRET_KEY?.slice(-16) ?? "tomame";
  return createHash("sha256").update(`${salt}:${value}`).digest("hex").slice(0, 12);
}
