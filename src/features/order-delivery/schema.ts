import * as z from "zod";

/**
 * The last-mile courier hand-off (migration 075): what an admin may type, and
 * what it becomes before it is stored.
 *
 * Pure and framework-free, so the admin panel can preview exactly what the
 * server will store and the route can validate with the same rules. The
 * database repeats the phone and https rules as CHECK constraints, so a write
 * that skips this module still cannot store a number nobody can dial or a
 * `javascript:` link the customer's page would render as a button.
 */

export const COURIER_PROVIDERS = ["uber", "yango", "bolt", "other"] as const;
export type CourierProvider = (typeof COURIER_PROVIDERS)[number];

export const COURIER_NAME_MAX = 80;
export const COURIER_URL_MAX = 2048;

// ── Phone ───────────────────────────────────────────────────────────────────

/**
 * A Ghana number, in whichever of the three ways people write one, as E.164
 * (`+233XXXXXXXXX`). Null when it is not a Ghana number.
 *
 * Accepted: `024 412 3456`, `0244123456`, `+233 24 412 3456`, `233244123456`,
 * `00233244123456`, and the common slip `+233 0244123456` (the trunk 0 kept
 * after the country code). Spaces, dashes, dots and brackets are ignored.
 *
 * The national number is nine digits and never starts with 0 — that is what
 * makes `+2330…` recognisably the slip rather than a different number.
 */
export function normaliseGhanaPhone(raw: string): string | null {
  const compact = raw.trim().replace(/[\s\-().]/g, "");
  if (!compact) return null;

  let national: string | null = null;
  if (/^0\d{9}$/.test(compact)) national = compact.slice(1);
  else if (/^\+233\d{9,10}$/.test(compact)) national = compact.slice(4);
  else if (/^00233\d{9,10}$/.test(compact)) national = compact.slice(5);
  else if (/^233\d{9,10}$/.test(compact)) national = compact.slice(3);
  if (national === null) return null;

  if (national.length === 10) {
    if (!national.startsWith("0")) return null;
    national = national.slice(1);
  }
  if (!/^[1-9]\d{8}$/.test(national)) return null;
  return `+233${national}`;
}

/** `+233 24 412 3456` — how the number is read aloud and printed. */
export function formatGhanaPhone(e164: string): string {
  const m = /^\+233(\d{2})(\d{3})(\d{4})$/.exec(e164);
  return m ? `+233 ${m[1]} ${m[2]} ${m[3]}` : e164;
}

/**
 * For logs and audit metadata: enough to tell two riders apart, not enough to
 * ring either. `+233 24 *** 3456`.
 */
export function maskPhone(e164: string | null | undefined): string | null {
  if (!e164) return null;
  const m = /^\+233(\d{2})\d{3}(\d{4})$/.exec(e164);
  return m ? `+233 ${m[1]} *** ${m[2]}` : "***";
}

// ── Tracking link ───────────────────────────────────────────────────────────

/**
 * Ride-hailing hosts. A host matches a domain when it IS the domain or a
 * subdomain of it — `m.uber.com` and `t.uber.com` are Uber; `uber.com.evil.io`
 * is not, because suffix matching is on a dot boundary.
 */
const PROVIDER_DOMAINS: ReadonlyArray<readonly [Exclude<CourierProvider, "other">, readonly string[]]> = [
  ["uber", ["uber.com"]],
  ["yango", ["yango.com", "yango.go.link", "go.yandex", "yango.ru"]],
  ["bolt", ["bolt.eu"]],
];

export function detectCourierProvider(url: string): CourierProvider {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "other";
  }
  for (const [provider, domains] of PROVIDER_DOMAINS) {
    if (domains.some((d) => host === d || host.endsWith(`.${d}`))) return provider;
  }
  return "other";
}

/**
 * The link, or a sentence saying why not. Only `https:` is accepted — which by
 * itself rules out `javascript:`, `data:`, `http:` and `file:` — and a link
 * carrying a username or password is refused, because `https://uber.com@evil.io`
 * reads as Uber to a person and goes to evil.io.
 */
export function parseTrackingUrl(raw: string): { ok: true; url: string } | { ok: false; message: string } {
  const trimmed = raw.trim();
  if (trimmed.length > COURIER_URL_MAX) return { ok: false, message: "That link is too long" };
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, message: "Paste the full tracking link, starting https://" };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, message: "The tracking link must start with https://" };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, message: "That link has a login in it. Paste the plain tracking link" };
  }
  if (!parsed.hostname.includes(".")) {
    return { ok: false, message: "That does not look like a web address" };
  }
  return { ok: true, url: parsed.toString() };
}

export const PROVIDER_LABELS: Record<CourierProvider, string> = {
  uber: "Uber",
  yango: "Yango",
  bolt: "Bolt",
  other: "the tracking page",
};

// ── The request body ────────────────────────────────────────────────────────

const optionalText = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ?? "").trim());

/**
 * `POST /api/admin/orders/:id/courier`. The provider is NOT an input: it is
 * derived from the link here, so a client cannot label an arbitrary site
 * "Uber" on the customer's screen.
 */
export const courierHandoffSchema = z
  .object({
    courier_name: optionalText.pipe(z.string().max(COURIER_NAME_MAX, "Keep the rider's name under 80 characters")),
    courier_phone: optionalText,
    tracking_url: optionalText,
  })
  .strict()
  .transform((input, ctx) => {
    let phone: string | null = null;
    if (input.courier_phone) {
      phone = normaliseGhanaPhone(input.courier_phone);
      if (!phone) {
        ctx.addIssue({
          code: "custom",
          path: ["courier_phone"],
          message: "Use a Ghana number: 024 412 3456 or +233 24 412 3456",
        });
        return z.NEVER;
      }
    }

    let url: string | null = null;
    if (input.tracking_url) {
      const parsed = parseTrackingUrl(input.tracking_url);
      if (!parsed.ok) {
        ctx.addIssue({ code: "custom", path: ["tracking_url"], message: parsed.message });
        return z.NEVER;
      }
      url = parsed.url;
    }

    if (!phone && !url) {
      ctx.addIssue({
        code: "custom",
        path: ["courier_phone"],
        message: "Add the rider's phone number or a tracking link",
      });
      return z.NEVER;
    }

    return {
      courier_name: input.courier_name || null,
      courier_phone: phone,
      tracking_url: url,
      provider: url ? detectCourierProvider(url) : null,
    };
  });

export type CourierHandoffInput = z.input<typeof courierHandoffSchema>;
export type CourierHandoff = z.output<typeof courierHandoffSchema>;
