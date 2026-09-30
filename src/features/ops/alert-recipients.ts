import { z } from "zod";

/**
 * Who the alert and summary emails go to (083).
 *
 * `site_settings.ops_alert_recipients` (private, admin-editable) is the list;
 * `OPS_ALERT_RECIPIENTS` (comma separated) replaces it when set, for a
 * deployment that must not mail the production list. The default is the one
 * address the owner asked for, so a database that lost the row still reaches
 * somebody rather than nobody.
 */
export const DEFAULT_ALERT_RECIPIENTS = ["kelanimdev@gmail.com"] as const;
export const MAX_ALERT_RECIPIENTS = 20;

const address = z.string().trim().toLowerCase().pipe(z.email());

/** The shape `/api/admin/content` accepts for the setting. */
export const alertRecipientsSettingSchema = z
  .array(address, { error: "A list of email addresses, for example [\"ops@example.com\"]" })
  .min(1, "Keep at least one address, or nobody hears about an outage")
  .max(MAX_ALERT_RECIPIENTS, `At most ${MAX_ALERT_RECIPIENTS} addresses`);

/** Valid, lower-cased, de-duplicated addresses from whatever the setting or env holds. */
export function parseRecipients(value: unknown): string[] {
  const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,;\s]+/) : [];
  const out: string[] = [];
  for (const item of items) {
    const parsed = address.safeParse(item);
    if (parsed.success && !out.includes(parsed.data)) out.push(parsed.data);
    if (out.length >= MAX_ALERT_RECIPIENTS) break;
  }
  return out;
}

export function resolveRecipients(envValue: string | undefined, settingValue: unknown): { recipients: string[]; from: "env" | "setting" | "default" } {
  const fromEnv = envValue ? parseRecipients(envValue) : [];
  if (fromEnv.length) return { recipients: fromEnv, from: "env" };
  const fromSetting = parseRecipients(settingValue);
  if (fromSetting.length) return { recipients: fromSetting, from: "setting" };
  return { recipients: [...DEFAULT_ALERT_RECIPIENTS], from: "default" };
}

/** The production host. Both Vercel projects build `main` as VERCEL_ENV=production, so the env alone cannot tell dev from prod. */
const PRODUCTION_HOSTS = new Set(["tomame.ca", "www.tomame.ca"]);

type DeployEnv = { OPS_ALERTS_ENABLED?: string; VERCEL_ENV?: string; NEXT_PUBLIC_APP_URL?: string; NODE_ENV?: string };

function appHost(env: DeployEnv): string | null {
  try {
    return env.NEXT_PUBLIC_APP_URL ? new URL(env.NEXT_PUBLIC_APP_URL).host : null;
  } catch {
    return null;
  }
}

/**
 * Whether this deployment actually sends. Production (tomame.ca) does; the
 * dev project, previews and local evaluate, record and send nothing unless
 * `OPS_ALERTS_ENABLED=true`. One push to main deploys dev and prod together,
 * and dev's half-configured jobs would otherwise mail the owner every hour.
 */
export function alertsEnabled(env: DeployEnv): boolean {
  if (env.OPS_ALERTS_ENABLED === "true") return true;
  if (env.OPS_ALERTS_ENABLED === "false") return false;
  return isProductionHost(env);
}

/**
 * Production is the tomame.ca address, and nothing else. NOT `VERCEL_ENV`:
 * this project does not expose Vercel's system variables to the app, so on
 * prod it is undefined and the check that required it labelled prod "local"
 * and never sent an alert (seen on the first prod run, 2026-09-30). Dev lives
 * at dev.tomame.ca and local at localhost, so the address alone tells them
 * apart; `next dev` pointed at the prod URL is still not production.
 */
function isProductionHost(env: DeployEnv): boolean {
  const host = appHost(env);
  return host !== null && PRODUCTION_HOSTS.has(host) && env.NODE_ENV !== "development";
}

/** "dev", "preview" or "local" in subjects, so a non-production email never reads as production. */
export function environmentLabel(env: DeployEnv): string | null {
  const host = appHost(env);
  if (isProductionHost(env)) return null;
  if (host?.startsWith("dev.") || host?.includes("-dev")) return "dev";
  if (env.VERCEL_ENV === "preview") return "preview";
  if (env.VERCEL_ENV) return host ?? env.VERCEL_ENV;
  return "local";
}
