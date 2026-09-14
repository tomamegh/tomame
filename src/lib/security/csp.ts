/**
 * Content-Security-Policy builder.
 *
 * Kept as a pure function (no request/response objects) so the policy string
 * itself is unit-testable without spinning up the proxy. `src/proxy.ts` is the
 * only caller: it resolves the Supabase origin from env and writes the header
 * on every response the proxy touches.
 *
 * Design, and why each relaxation is there:
 *
 * - `script-src` is `'self' 'unsafe-inline'`, and that is a DELIBERATE RETREAT
 *   from something stricter that does not work here. The first cut used a
 *   per-request nonce with `'strict-dynamic'`, the pattern Next documents, and
 *   it verified clean in development. On a PRODUCTION build it takes the site
 *   down: Next stamps the nonce into the HTML when it renders a page, but a
 *   prerendered page's HTML is generated at build time, so the nonce baked
 *   into it can never match the one this proxy mints on the request. Every
 *   script on such a page is refused. `/auth/login` is one of those pages, and
 *   its served HTML carries no nonce attribute at all while the header demands
 *   one, so nobody could have signed in. Caught by serving `next build` output
 *   and reading the console; it is invisible in `next dev`, where nothing is
 *   prerendered.
 *
 *   `'self'` still means no third-party script host can be loaded, which is
 *   the injection route an attacker reaches for first. `'unsafe-inline'` means
 *   an injected inline `<script>` would run, so this directive is NOT the
 *   defence against XSS on this app; escaping and React's own handling are.
 *   Making it strict again means either rendering every page dynamically, or
 *   moving the CSP out of the proxy and into the page render where the nonce
 *   is known. Both are real options and neither is a one-line change.
 *
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
 *   for its debugging overlay. Next's own docs say React "will never use
 *   eval() in production mode", and that held up under `npm run build` — a
 *   production response carries no `unsafe-eval`.
 */

export interface CspOptions {
  /** Origin (scheme + host [+ port]) the app's Supabase client talks to. */
  supabaseOrigin: string;
  /** Adds directives that only make sense once the app is served over https, and drops the dev-only `unsafe-eval`. */
  isProd: boolean;
}

export function buildCsp({ supabaseOrigin, isProd }: CspOptions): string {
  const scriptSrc = isProd
    ? `script-src 'self' 'unsafe-inline'`
    : `script-src 'self' 'unsafe-inline' 'unsafe-eval'`;
  const directives = [
    `default-src 'self'`,
    scriptSrc,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src 'self' ${supabaseOrigin}`,
    // The installed app's two extra fetches. `manifest-src` would otherwise
    // fall back to `default-src`, which happens to allow it today — naming it
    // means a future tightening of `default-src` cannot silently uninstall the
    // app. `worker-src` is NOT redundant: it falls back through `child-src` to
    // `script-src`, and registering `/sw.js` against a `script-src` carrying
    // `'strict-dynamic'` is refused outright.
    `manifest-src 'self'`,
    `worker-src 'self'`,
    `frame-src 'none'`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ];
  if (isProd) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}
