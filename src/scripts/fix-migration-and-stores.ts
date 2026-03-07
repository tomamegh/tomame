/**
 * Run migration 007 and add missing supported stores.
 * Run: bun --env-file=.env run src/scripts/fix-migration-and-stores.ts
 */
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// ── 1. Run Migration 007 ─────────────────────────────────

console.log("=== Running Migration 007 ===");

const { error: migError } = await supabase.rpc("exec_sql", {
  query: `
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS review_reasons TEXT[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS extraction_metadata JSONB;
  `,
});

if (migError) {
  // rpc exec_sql may not exist — try raw SQL via postgrest
  console.log("rpc not available, trying direct column check...");

  // Check if columns already exist
  const { error: checkErr } = await supabase
    .from("orders")
    .select("needs_review")
    .limit(1);

  if (checkErr) {
    console.log("Migration needs to be run manually in Supabase SQL Editor.");
    console.log("Copy and paste this SQL:\n");
    console.log(`ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reasons TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS extraction_metadata JSONB;`);
    console.log("\n(Supabase client SDK cannot run DDL statements directly)");
  } else {
    console.log("Columns already exist — migration not needed.");
  }
} else {
  console.log("Migration 007 applied successfully.");
}

// ── 2. Add Missing Stores ────────────────────────────────

console.log("\n=== Adding Missing Stores ===");

const newStores = [
  { domain: "aliexpress.com", display_name: "AliExpress" },
  { domain: "alibaba.com", display_name: "Alibaba" },
  { domain: "shein.com", display_name: "Shein" },
  { domain: "temu.com", display_name: "Temu" },
  { domain: "walmart.com", display_name: "Walmart" },
  { domain: "target.com", display_name: "Target" },
  { domain: "bestbuy.com", display_name: "Best Buy" },
  { domain: "argos.co.uk", display_name: "Argos UK" },
];

for (const store of newStores) {
  // Check if already exists
  const { data: existing } = await supabase
    .from("supported_stores")
    .select("id")
    .eq("domain", store.domain)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log(`  ${store.domain} — already exists, skipping`);
    continue;
  }

  const { error } = await supabase.from("supported_stores").insert({
    domain: store.domain,
    display_name: store.display_name,
    enabled: true,
  });

  if (error) {
    console.log(`  ${store.domain} — ERROR: ${error.message}`);
  } else {
    console.log(`  ${store.domain} — ADDED`);
  }
}

// ── 3. Verify ────────────────────────────────────────────

console.log("\n=== Verification ===");

const { data: allStores } = await supabase
  .from("supported_stores")
  .select("domain, display_name, enabled")
  .order("domain");

console.log("\nAll supported stores:");
allStores?.forEach((s) =>
  console.log(`  ${s.enabled ? "✅" : "❌"} ${s.domain} — ${s.display_name}`),
);

const { error: colCheck } = await supabase
  .from("orders")
  .select("needs_review")
  .limit(1);
console.log(
  `\nMigration 007: ${colCheck ? "NOT applied — run SQL manually" : "Applied ✅"}`,
);
