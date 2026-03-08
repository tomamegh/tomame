/**
 * Test stores, pricing, and domain validation against live Supabase.
 * Run: bun --env-file=.env run src/scripts/test-features.ts
 */
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// ── Domain Validation ─────────────────────────────────────

const { data: stores } = await supabase
  .from("supported_stores")
  .select("domain, enabled")
  .eq("enabled", true);
const enabledDomains = (stores ?? []).map((s) => s.domain as string);

function isDomainAllowed(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return enabledDomains.some(
      (d) => hostname === d || hostname.endsWith(`.${d}`),
    );
  } catch {
    return false;
  }
}

console.log("=== Domain Validation ===");
console.log(
  "amazon.com product:     ",
  isDomainAllowed("https://www.amazon.com/dp/B123") ? "ALLOWED" : "BLOCKED",
);
console.log(
  "amazon.co.uk product:   ",
  isDomainAllowed("https://www.amazon.co.uk/dp/B123") ? "ALLOWED" : "BLOCKED",
);
console.log(
  "ebay.com product:       ",
  isDomainAllowed("https://www.ebay.com/itm/123") ? "ALLOWED" : "BLOCKED",
);
console.log(
  "aliexpress.com product: ",
  isDomainAllowed("https://www.aliexpress.com/item/123.html")
    ? "ALLOWED"
    : "BLOCKED",
);
console.log(
  "random-store.com:       ",
  isDomainAllowed("https://random-store.com/product") ? "ALLOWED" : "BLOCKED",
);

// ── Pricing Calculation ───────────────────────────────────

const { data: configs } = await supabase.from("pricing_config").select("*");

function calcPricing(
  region: string,
  itemPrice: number,
  qty: number,
): void {
  const config = configs?.find((c) => c.region === region);
  if (!config) {
    console.log(`  (no config for ${region})`);
    return;
  }
  const subtotal = itemPrice * qty;
  const shippingFee = config.base_shipping_fee_usd;
  const serviceFee = subtotal * config.service_fee_percentage;
  const totalUsd = subtotal + shippingFee + serviceFee;
  const totalGhs = totalUsd * config.exchange_rate;
  console.log(`  Item:       $${subtotal}${qty > 1 ? ` ($${itemPrice} x ${qty})` : ""}`);
  console.log(`  Shipping:   $${shippingFee}`);
  console.log(`  Service:    $${serviceFee} (${config.service_fee_percentage * 100}%)`);
  console.log(`  Total USD:  $${totalUsd}`);
  console.log(`  Rate:       1 USD = ${config.exchange_rate} GHS`);
  console.log(`  Total GHS:  GHS ${totalGhs.toFixed(2)}`);
}

console.log("\n=== Pricing: USA, $50 item, qty 1 ===");
calcPricing("USA", 50, 1);

console.log("\n=== Pricing: UK, $75 item, qty 1 ===");
calcPricing("UK", 75, 1);

console.log("\n=== Pricing: CHINA, $25 item, qty 2 ===");
calcPricing("CHINA", 25, 2);

// ── Migration 007 Check ──────────────────────────────────

const { error: migErr } = await supabase
  .from("orders")
  .select("needs_review")
  .limit(1);

console.log("\n=== Migration 007 Status ===");
if (migErr) {
  console.log("NOT RUN — new columns missing:", migErr.message);
  console.log("\nTo fix, run this SQL in Supabase SQL Editor:");
  console.log(`
  ALTER TABLE orders
    ADD COLUMN needs_review BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN review_reasons TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN reviewed_by UUID REFERENCES users(id),
    ADD COLUMN reviewed_at TIMESTAMPTZ,
    ADD COLUMN extraction_metadata JSONB;
  `);
} else {
  console.log("Migration 007 applied: YES");
}
