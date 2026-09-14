/**
 * Content-Security-Policy builder.
 *
 * Kept as a pure function (no request/response objects) so the policy string
 * itself is unit-testable without spinning up the proxy. `src/proxy.ts` is the
 * only caller: it mints a per-request nonce, resolves the Supabase origin from
 * env, and writes the header on every response the proxy touches.
 *
 * Design, and why each relaxation is there:
 *
 * - `script-src` is the strict one: `'nonce-<value>' 'strict-dynamic'` and
 *   nothing else. Next.js reads the nonce back out of this exact header (it
 *   greps `script-src` — falling back to `default-src` — for a quoted
 *   `'nonce-...'` token) and stamps it onto every inline script it generates
 *   itself (the RSC payload, the hydration bootstrap). `strict-dynamic` lets
 *   those nonce-carrying scripts load Next's own chunked bundles without
 *   listing every chunk URL. No third-party script host is on the app today
 *   (Paystack is a server-issued redirect URL the browser navigates to, not a
 *   script tag; Vercel Analytics/Speed Insights ship same-origin `/_vercel/...`
 *   paths) — if one is ever added it has to carry this same nonce or the
 *   browser drops it.
 * - `style-src` keeps `'unsafe-inline'`. Radix/shadcn primitives and
 *   `next/image`'s placeholder sizing set the HTML `style="..."` attribute
 *   directly in server-rendered markup, which CSP checks against `style-src`
 *   the same as a `<style>` tag. A style nonce would mean threading a nonce
 *   through every third-party component that does this, which is not
 *   something this file can enforce. Style-attribute injection is a much
 *   smaller blast radius than script injection (no arbitrary JS execution),
 *   so the trade-off is deliberate, not an oversight.
 * - `img-src` stays wide (`https:` plus `data:`/`blob:`). This is the customer
 *   photo problem, not a gap: the catalogue shows product photos scraped from
 *   whatever store the customer pasted, so the set of legitimate image hosts
 *   is unbounded by design. That is a different surface from the `/_next/image`
 *   proxy (see `src/lib/security/image-hosts.ts`) — this directive only says
 *   what the *browser* may fetch directly for itself, which was never the
 *   thing spending our bandwidth.
 * - `connect-src` adds exactly the configured Supabase origin (computed from
 *   `NEXT_PUBLIC_SUPABASE_URL`, so it is `http://127.0.0.1:54321` locally and
 *   `https://<project>.supabase.co` against a real project) plus `'self'` for
 *   every same-origin `/api/*` call the app makes through TanStack Query.
 * - `frame-ancestors 'none'` answers W9 directly (the admin console was
 *   framable); `frame-src 'none'` because nothing in the app embeds an iframe.
 * - `upgrade-insecure-requests` is production-only. Local dev talks to
 *   Supabase over plain `http://127.0.0.1:54321`; forcing an upgrade there
 *   would break every request the moment this directive is unconditional.
 * - `script-src` also gets `'unsafe-eval'`, but ONLY outside production.
 *   React's dev build calls `eval()` itself, to reconstruct component stacks
 *   for its debugging overlay (confirmed locally: without this, every page
 *   logs "eval() is not supported in this environment... make sure that
 *   `unsafe-eval` is included"). Next's own docs say React "will never use
 *   eval() in production mode", and that held up under `npm run build` — a
 *   production response carries no `unsafe-eval`.
 */

export interface CspOptions {
  /** Per-request base64/base64url nonce, unique every time. */
  nonce: string;
  /** Origin (scheme + host [+ port]) the app's Supabase client talks to. */
  supabaseOrigin: string;
  /** Adds directives that only make sense once the app is served over https, and drops the dev-only `unsafe-eval`. */
  isProd: boolean;
}

export function buildCsp({ nonce, supabaseOrigin, isProd }: CspOptions): string {
  const scriptSrc = isProd
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`;
  const directives = [
    `default-src 'self'`,
    scriptSrc,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src 'self' ${supabaseOrigin}`,
    `frame-src 'none'`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ];
  if (isProd) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}
