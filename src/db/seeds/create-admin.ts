/**
 * Grants the `admin` role to a user, creating the auth user if it does not
 * exist yet. Idempotent: safe to re-run.
 *
 *   npx tsx --env-file=.env.local src/db/seeds/create-admin.ts <email> [--password=...]
 *
 * Without --password the auth user is created with no password and a confirmed
 * email, which is what you want for someone who signs in with Google: Supabase
 * links the Google identity to the existing user on first sign-in because the
 * provider returns the same verified address.
 *
 * Service-role only, so it bypasses RLS — including the "No direct profile
 * inserts" policy. Never import this from application code.
 */
import { createClient } from "@supabase/supabase-js";

const emailArg = process.argv[2]?.trim().toLowerCase();
const password = process.argv
  .slice(3)
  .find((a) => a.startsWith("--password="))
  ?.slice("--password=".length);

if (!emailArg) {
  console.error("Usage: create-admin.ts <email> [--password=...]");
  process.exit(1);
}
const email: string = emailArg;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY. " +
      "Run with --env-file=.env.local.",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** The admin API has no get-by-email, so page through until the address turns up. */
async function findUserByEmail(target: string) {
  const perPage = 200;
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < perPage) return null;
  }
  return null;
}

async function main() {
  console.log(`Project: ${url}`);
  console.log(`Target:  ${email}\n`);

  let user = await findUserByEmail(email);

  if (user) {
    console.log(`• auth user exists: ${user.id}`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      ...(password ? { password } : {}),
      email_confirm: true,
    });
    if (error) throw error;
    user = data.user;
    console.log(`• auth user created: ${user.id}`);
  }

  const { data: existing, error: readError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (readError) throw readError;

  if (existing?.role === "admin") {
    console.log("• profile already has role=admin — nothing to change");
    console.log("\nDone (no-op).");
    return;
  }

  // The on_auth_user_created trigger normally supplies this row; upsert covers
  // the case where it is missing (user predates the trigger, row deleted, ...).
  const { error: upsertError } = await supabase
    .from("profiles")
    .upsert({ id: user.id, role: "admin" }, { onConflict: "id" });
  if (upsertError) throw upsertError;
  console.log(`• profile role: ${existing?.role ?? "(none)"} → admin`);

  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor_id: user.id,
    actor_role: "system",
    action: "admin_role_granted",
    entity_type: "user",
    entity_id: user.id,
    metadata: { email, granted_by: "seed:create-admin" },
  });
  if (auditError) throw auditError;
  console.log("• audit_logs: admin_role_granted written");

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("\nFailed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
