import { NextRequest, NextResponse } from "next/server";
import { browserlessClient } from "@/lib/browserless/client";
import { logger } from "@/lib/logger";

/**
 * Hosts whose images must be proxied because the CDN is bot-protected.
 * Value is the origin to navigate to first so browserless can clear any
 * Cloudflare / bot challenge and acquire the cookies the CDN expects.
 */
const ALLOWED_HOSTS: Record<string, string> = {
  "productimages.microcenter.com": "https://www.microcenter.com/",
};

export async function GET(request: NextRequest) {
  const src = request.nextUrl.searchParams.get("src");
  if (!src) {
    return NextResponse.json({ error: "Missing src" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(src);
  } catch {
    return NextResponse.json({ error: "Invalid src URL" }, { status: 400 });
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return NextResponse.json({ error: "Unsupported protocol" }, { status: 400 });
  }

  const host = parsed.hostname.toLowerCase();
  const origin = ALLOWED_HOSTS[host];
  if (!origin) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 400 });
  }

  const result = await browserlessClient.fetchImageViaBrowser(src, origin);
  if (!result) {
    logger.warn("img-proxy upstream fetch failed", { src });
    return NextResponse.json({ error: "Upstream fetch failed" }, { status: 502 });
  }

  return new NextResponse(new Uint8Array(result.bytes), {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      // Cache aggressively — image bytes don't change for a given product URL
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800, immutable",
    },
  });
}
