/**
 * Admin seed script.
 * Usage: npx tsx src/db/seeds/create-admin.ts <email> <password>
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY
 * in .env.local or exported in the environment.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in environment"
  );
  process.exit(1);
}

const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.error("Usage: npx tsx src/db/seeds/create-admin.ts <email> <password>");
  process.exit(1);
}

if (password.length < 8) {
  console.error("Password must be at least 8 characters");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // 1. Create auth user with confirmed email
  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authError) {
    console.error("Failed to create auth user:", authError.message);
    process.exit(1);
  }

  const userId = authData.user.id;
  console.log("Auth user created:", userId);

  // 2. Insert users row with admin role
  const { error: userError } = await supabase.from("profiles").insert({
    id: userId,
    email,
    role: "admin",
  });

  if (userError) {
    // Rollback auth user
    await supabase.auth.admin.deleteUser(userId);
    console.error("Failed to insert user record:", userError.message);
    process.exit(1);
  }

  console.log("Admin user record created");

  // 3. Audit log
  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor_id: userId,
    actor_role: "system",
    action: "admin_user_created_via_seed",
    entity_type: "user",
    entity_id: userId,
  });

  if (auditError) {
    console.warn("Audit log insert failed (non-blocking):", auditError.message);
  }

  console.log("\nAdmin user created successfully!");
  console.log(`Email: ${email}`);
  console.log("Change the password after first login.");
}

main();
