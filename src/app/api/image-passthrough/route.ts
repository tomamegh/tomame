import { NextRequest, NextResponse } from "next/server";

import { RATE_LIMIT } from "@/config/security";
import { isAllowedImageHost } from "@/lib/security/image-hosts";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * The graceful half of the open-image-proxy fix.
 *
 * `/_next/image` now only optimizes hosts on the measured allowlist
 * (`src/lib/security/image-hosts.ts`), because with `hostname: "**"` anyone
 * could resize arbitrary internet images through our domain and bill us the
 * bandwidth. But the catalogue scrapes stores nobody registered, so an unlisted
 * host is a REAL product photo and must still appear: not one of this app's 36
 * image components has an error fallback, so a refusal is a visibly broken
 * product.
 *
 * WHY NOT A REDIRECT. The obvious answer, a 307 to the original URL, turns this
 * domain into an open redirect: `tomame.ca/_next/image?url=https://phishing`
 * would send a visitor anywhere, with our name on the link. That trades a
 * bandwidth problem for a phishing one. The proxy REWRITES to this route
 * instead, so the browser only ever sees our origin, and the fetch happens here
 * under conditions we control.
 *
 * What those conditions are, in order of how much they matter:
 *
 *  1. No private address space. A URL resolving to loopback, link-local or an
 *     RFC1918 range would make this an SSRF gadget pointed at the platform's own
 *     network and at cloud metadata endpoints.
 *  2. The response must actually be an image. Without this, the route serves
 *     attacker-controlled HTML from our origin, which is the same-origin
 *     phishing the redirect was rejected for.
 *  3. Bounded: a timeout, a size cap and a per-IP rate limit, because this
 *     spends our bandwidth by design.
 */
export const maxDuration = 20;

/** Bigger than any product photo; small enough that nobody streams a film through us. */
const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 8000;

/** Hosts that must never be fetched: this server's own network and its neighbours. */
const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal)$/i;
const PRIVATE_IPV4 =
  /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/;

function isPrivateTarget(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (PRIVATE_HOST.test(host)) return true;
  if (PRIVATE_IPV4.test(host)) return true;
  // IPv6 loopback and unique-local / link-local ranges.
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return true;
  return false;
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url");
  if (!raw) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return NextResponse.json({ error: "Unsupported protocol" }, { status: 400 });
  }
  if (isPrivateTarget(target.hostname)) {
    logger.warn("image passthrough refused a private target", { host: target.hostname });
    return NextResponse.json({ error: "Host not allowed" }, { status: 400 });
  }
  // An allowlisted host should have gone to the optimizer, not here. Refusing
  // keeps exactly one path per host and stops this route being used to skip
  // the optimizer's own cache.
  if (isAllowedImageHost(target.hostname)) {
    return NextResponse.json({ error: "Use the image optimizer for this host" }, { status: 400 });
  }

  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  if (!checkRateLimit(`image-passthrough:${ip}`, RATE_LIMIT.imgProxy).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "image/*" },
    });
  } catch (error) {
    logger.warn("image passthrough upstream failed", {
      host: target.hostname,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Upstream fetch failed" }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: "Upstream fetch failed" }, { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    logger.warn("image passthrough refused a non-image response", { host: target.hostname, contentType });
    return NextResponse.json({ error: "Not an image" }, { status: 415 });
  }

  const declared = Number(upstream.headers.get("content-length") ?? "0");
  if (declared > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }

  const bytes = new Uint8Array(await upstream.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(bytes.byteLength),
      // Never let a fetched document be sniffed into something executable.
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
