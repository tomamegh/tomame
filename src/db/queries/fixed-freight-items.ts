import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface FixedFreightItemRow {
  id: string;
  category: string;
  product_name: string;
  freight_rate_ghs: number;
  keywords: string[];
  sort_order: number;
}

/** Active pre-negotiated freight items, cheapest sort first. */
export async function getActiveFixedFreightItems(): Promise<FixedFreightItemRow[]> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("fixed_freight_items")
    .select("id, category, product_name, freight_rate_ghs, keywords, sort_order")
    .eq("is_active", true)
    .order("sort_order");

  if (error) throw new Error(`Failed to load fixed freight items: ${error.message}`);

  return (data ?? []).map((r) => ({
    id: String(r.id),
    category: String(r.category),
    product_name: String(r.product_name),
    freight_rate_ghs: Number(r.freight_rate_ghs),
    keywords: Array.isArray(r.keywords) ? r.keywords.map(String) : [],
    sort_order: Number(r.sort_order),
  }));
}
