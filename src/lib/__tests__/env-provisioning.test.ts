import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

/**
 * The seam between the application and what provisions it.
 *
 * src/lib/env.ts throws at module load for a missing variable, so a name that
 * Terraform does not set is not a degraded feature — it is every route
 * returning 500 the moment the deployment goes live. Nothing else in the repo
 * checks that the two agree: `terraform plan` cannot read env.ts, and the app's
 * own tests all mock env.ts away.
 *
 * This is not hypothetical. .env in this repo carries
 * NEXT_PUBLIC_SUPABASE_ANON_KEY while env.ts requires
 * NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and that single rename is why
 * `npm run build` currently fails. A check on this seam catches that class of
 * drift at test time rather than at deploy time.
 */

const REPO_ROOT = path.resolve(__dirname, "../../..");
const ENV_TS = path.join(REPO_ROOT, "src/lib/env.ts");
const INFRA_MAIN = path.join(REPO_ROOT, "infra/main.tf");
const INFRA_VARS = path.join(REPO_ROOT, "infra/variables.tf");

/** Variables the platform injects; nothing provisions these. */
const PLATFORM_PROVIDED = new Set([
  "NODE_ENV",
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_REGION",
  "VERCEL_GIT_COMMIT_SHA",
  "npm_package_version",
]);

// ── Extraction ───────────────────────────────────────────────────────────────

/** Names env.ts declares as required — the ones it throws on. */
function requiredByApp(): string[] {
  const source = readFileSync(ENV_TS, "utf8");
  return [...source.matchAll(/required\(\s*"([^"]+)"\s*\)/g)].map((m) => m[1]!);
}

/** Keys of the `provisioned_env` map in infra/main.tf — values Terraform derives. */
function provisionedByTerraform(): string[] {
  const source = readFileSync(INFRA_MAIN, "utf8");
  const start = source.indexOf("provisioned_env = {");
  if (start === -1) throw new Error("provisioned_env block not found in infra/main.tf");
  const end = source.indexOf("\n  }", start);
  const block = source.slice(start, end);
  return [...block.matchAll(/^\s{4}([A-Z][A-Z0-9_]*)\s*=/gm)].map((m) => m[1]!);
}

/** Vendor keys infra/variables.tf requires the operator to supply. */
function requiredThirdPartySecrets(): string[] {
  const source = readFileSync(INFRA_VARS, "utf8");
  const start = source.indexOf("setsubtract([");
  if (start === -1) throw new Error("third_party_secrets validation not found in infra/variables.tf");
  const end = source.indexOf("], keys(var.third_party_secrets))", start);
  const block = source.slice(start, end);
  return [...block.matchAll(/"([A-Z][A-Z0-9_]*)"/g)].map((m) => m[1]!);
}

/**
 * Vendor keys for tiers the app degrades without. Allowed to be absent at
 * runtime, but they must still be a declared category in infra/ — the point is
 * that "optional" is a decision someone wrote down, not a variable nobody
 * noticed.
 */
function optionalThirdPartySecrets(): string[] {
  const source = readFileSync(INFRA_VARS, "utf8");
  const start = source.indexOf("setsubtract(keys(var.optional_third_party_secrets), [");
  if (start === -1) {
    throw new Error("optional_third_party_secrets validation not found in infra/variables.tf");
  }
  const end = source.indexOf("]))", start);
  const block = source.slice(start, end);
  return [...block.matchAll(/"([A-Z][A-Z0-9_]*)"/g)].map((m) => m[1]!);
}

/** Everything provisioning deploys to Vercel — the app's runtime environment. */
function deployedToVercel(): string[] {
  return [
    ...provisionedByTerraform(),
    ...requiredThirdPartySecrets(),
    ...optionalThirdPartySecrets(),
  ];
}

/** Every process.env.X read anywhere under src/. */
function readAtRuntime(): Map<string, string> {
  const found = new Map<string, string>();

  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry !== "node_modules" && entry !== "__tests__") walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      const source = readFileSync(full, "utf8");
      const rel = path.relative(REPO_ROOT, full);
      for (const m of source.matchAll(/process\.env(?:\.([A-Z][A-Z0-9_]*)|\[\s*"([A-Z][A-Z0-9_]*)"\s*\])/g)) {
        const name = m[1] ?? m[2]!;
        if (!found.has(name)) found.set(name, rel);
      }
    }
  }

  walk(path.join(REPO_ROOT, "src"));
  return found;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("infra provisions what the app requires", () => {
  // Guard the extractors themselves. A regex that silently stops matching turns
  // every assertion below into a vacuous pass, which is worse than no test.
  it("extracts a plausible set from each source", () => {
    expect(requiredByApp().length).toBeGreaterThanOrEqual(5);
    expect(provisionedByTerraform().length).toBeGreaterThanOrEqual(5);
    expect(requiredThirdPartySecrets().length).toBeGreaterThanOrEqual(5);
    expect(optionalThirdPartySecrets().length).toBeGreaterThanOrEqual(1);
    expect(readAtRuntime().size).toBeGreaterThanOrEqual(5);
  });

  it("sets every variable env.ts throws without", () => {
    const managed = new Set([...provisionedByTerraform(), ...requiredThirdPartySecrets()]);
    const missing = requiredByApp().filter((key) => !managed.has(key));

    expect(missing, `src/lib/env.ts requires these, but infra/ never sets them: ${missing.join(", ")}`).toEqual([]);
  });

  it("sets every variable read through process.env at runtime", () => {
    const managed = new Set([
      ...provisionedByTerraform(),
      ...requiredThirdPartySecrets(),
      ...optionalThirdPartySecrets(),
    ]);
    const unmanaged = [...readAtRuntime()]
      .filter(([key]) => !managed.has(key) && !PLATFORM_PROVIDED.has(key))
      .map(([key, file]) => `${key} (${file})`);

    expect(unmanaged, `read at runtime but never provisioned:\n  ${unmanaged.join("\n  ")}`).toEqual([]);
  });

  it("does not provision a NEXT_PUBLIC_ name for a server-only secret", () => {
    // Anything NEXT_PUBLIC_* is inlined into the browser bundle at build time.
    // A secret behind that prefix is published to every visitor.
    const secretish = /(SECRET|SERVICE_ROLE|PRIVATE|_KEY$)/;
    const leaked = [...provisionedByTerraform(), ...requiredThirdPartySecrets()].filter(
      (key) =>
        key.startsWith("NEXT_PUBLIC_") &&
        secretish.test(key.replace("NEXT_PUBLIC_", "")) &&
        // Paystack's public key and Supabase's publishable key are designed to
        // be public; both are safe only because the server verifies everything.
        !["NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"].includes(key),
    );

    expect(leaked, `NEXT_PUBLIC_ names that look like server secrets: ${leaked.join(", ")}`).toEqual([]);
  });

  // ── R12: the deployment holds only what the app can actually use ───────────

  it("does not deploy a database credential to Vercel", () => {
    // The app reaches Supabase over HTTPS and never opens a Postgres
    // connection, so a database credential in the build environment is one
    // nothing there can use — while every preview deployment and everyone with
    // project access would hold direct superuser access to the data.
    const databaseCredential = /(DB_PASSWORD|DATABASE_URL|DB_HOST|CONNECTION_STRING|^POSTGRES_)/;
    const deployed = deployedToVercel().filter((key) => databaseCredential.test(key));

    expect(
      deployed,
      `database credentials deployed to Vercel, which no code path there can use: ${deployed.join(", ")}`,
    ).toEqual([]);
  });

  it("still has no direct database connection, which is why the rule above holds", () => {
    // This guards the PREMISE, not the conclusion. R12 excludes the database
    // credentials from the deployment because nothing in the app can use them.
    // The day someone adds Drizzle, Prisma or node-postgres that stops being
    // true, and the connection string becomes something the app legitimately
    // needs — at which point this test failing is the prompt to make that
    // decision deliberately, rather than discovering it as a 500 at boot.
    const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
    const dependencies = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    const drivers = dependencies.filter((name) =>
      /^(pg|postgres|@prisma\/client|prisma|drizzle-orm|kysely|typeorm|sequelize|knex)$/.test(name),
    );

    expect(
      drivers,
      `a Postgres client was added (${drivers.join(", ")}). The app may now need DATABASE_URL deployed — revisit R12 in specs/spec_infra.hcl rather than deleting this test.`,
    ).toEqual([]);

    const readsConnectionString = [...readAtRuntime().keys()].filter((key) =>
      /(DATABASE_URL|DB_PASSWORD|CONNECTION_STRING)/.test(key),
    );

    expect(
      readsConnectionString,
      `src/ now reads ${readsConnectionString.join(", ")} — provisioning does not deploy it, so this would be undefined at runtime.`,
    ).toEqual([]);
  });
});
