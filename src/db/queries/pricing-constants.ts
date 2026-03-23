import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface PricingConstantRow {
  key: string;
  value: number;
}

/**
 * Fetch all pricing constants as a key→value map.
 * Uses service role to bypass RLS (server-side only).
 */
export async function getPricingConstantsMap(): Promise<Record<string, number>> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("pricing_constants")
    .select("key, value");

  if (error) {
    throw new Error(`Failed to load pricing constants: ${error.message}`);
  }

  const map: Record<string, number> = {};
  for (const row of data ?? []) {
    map[row.key] = Number(row.value);
  }
  return map;
}
