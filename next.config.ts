import type { NextConfig } from "next";
import type { RemotePattern } from "next/dist/shared/lib/image-config";

import { IMAGE_HOST_ALLOWLIST } from "./src/lib/security/image-hosts";

// `/_next/image` was an open proxy: `remotePatterns` used to be
// `[{ protocol: "https", hostname: "**" }]`, so anyone could make this
// deployment fetch and resize an arbitrary internet image on our bandwidth
// and function time (verified: `GET /_next/image?url=https://...&w=64`
// returned 200 for a host with nothing to do with Tomame). `IMAGE_HOST_ALLOWLIST`
// is a measured list — see `src/lib/security/image-hosts.ts` for what was
// queried and why each host is on it — turned into the `RemotePattern[]`
// shape Next wants: the exact host, plus `**.<host>` for entries where any
// subdomain should also match.
const remotePatterns: RemotePattern[] = IMAGE_HOST_ALLOWLIST.flatMap((entry): RemotePattern[] => {
    const exact: RemotePattern = { protocol: "https", hostname: entry.hostname };
    if (!entry.matchSubdomains) return [exact];
    return [exact, { protocol: "https", hostname: `**.${entry.hostname}` }];
});

const nextConfig: NextConfig = {
    // Next 16.3 writes its own "rules for AI agents" block into CLAUDE.md every
    // time `next dev` starts. CLAUDE.md is this project's instruction file and
    // the authority for how the repo is worked; a framework appending to it
    // means the rules an agent reads are partly written by a tool nobody asked,
    // and it shows up as a spurious dirty file in every `git status`.
    agentRules: false,
    images: {
        remotePatterns: [
            ...remotePatterns,
            // SHEIN's CDN serves images over http on some product pages.
            // We upgrade to https in the scraper, but cached extractions
            // from before that fix still carry http URLs.
            {
                protocol: "http",
                hostname: "img.ltwebstatic.com",
            },
            {
                protocol: "http",
                hostname: "img.shein.com",
            },
        ],
        localPatterns: [
            {
                pathname: "/api/img-proxy",
            },
            {
                pathname: "/images/**",
            },
            {
                pathname: "/icons/**",
            },
            // Admin-uploaded marketing photos, streamed from the private
            // storage bucket by /api/media/[key]. Same-origin on purpose.
            {
                pathname: "/api/media/**",
            },
        ],
        // A host that isn't on the allowlist above must still render — the
        // catalogue scrapes whatever store the customer pasted, so "unknown
        // host" is a normal, expected case (hosted dev has real
        // `extraction_cache` rows from a store nobody registered). This is
        // NOT handled with a custom `images.loader`: that was tried and
        // reverted, because setting `loader: "custom"` turns out to disable
        // Next's own `/_next/image` route entirely (confirmed empirically —
        // every request to it, including same-origin marketing photos and
        // allowlisted ones, 404s once a custom loader is configured; it is
        // not documented, but it is real). The graceful-degradation half of
        // this fix lives in `src/proxy.ts` / `src/lib/supabase/proxy.ts`
        // instead: it inspects `/_next/image?url=...` requests before they
        // reach Next's handler and 307s a non-allowlisted host straight to
        // the original image, so the browser fetches it unoptimized rather
        // than getting a 400. `remotePatterns` above is still the real
        // security boundary — Next enforces it inside `/_next/image` itself
        // regardless of how a request got there, so this stays closed even if
        // the proxy is ever bypassed.
    },
    async headers() {
        return [
            {
                // Applies to every response. The one header that can't live here —
                // Content-Security-Policy — needs a fresh nonce per request, so it's
                // set in src/proxy.ts instead; everything below is static and safe
                // to compute once.
                source: "/(.*)",
                headers: [
                    {
                        // Two years, subdomains included. Long-lived on purpose: HSTS
                        // only protects a browser that has already seen it once, so a
                        // short max-age reopens the window on every expiry.
                        key: "Strict-Transport-Security",
                        value: "max-age=63072000; includeSubDomains",
                    },
                    {
                        // Stops a browser from sniffing a response into a different
                        // content type than what we declared (e.g. treating an
                        // uploaded "image" as HTML/JS because the bytes looked like it).
                        key: "X-Content-Type-Options",
                        value: "nosniff",
                    },
                    {
                        // Legacy fallback for the browsers that don't honour the CSP
                        // `frame-ancestors` directive proxy.ts sets on every response.
                        // The admin console has no business being iframed anywhere.
                        key: "X-Frame-Options",
                        value: "DENY",
                    },
                    {
                        // Send the full path to same-origin navigations (so in-app
                        // analytics/logging still see it), but only the origin — no
                        // path, no query string — cross-origin, so a store URL a
                        // customer pasted never leaks to that store's own site via
                        // the Referer header.
                        key: "Referrer-Policy",
                        value: "strict-origin-when-cross-origin",
                    },
                    {
                        // Nothing in the app uses any of these browser APIs. Deny them
                        // outright rather than leaving the default (which allows same-origin
                        // use) so a future dependency can't quietly start prompting for
                        // camera/mic/location access on a shopping site.
                        key: "Permissions-Policy",
                        value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
                    },
                ],
            },
        ];
    },
};

export default nextConfig;
