import { NextResponse, type NextRequest } from "next/server";

import { catalogueRedirectHref } from "@/features/extraction/components/buy-for-me-mode";

/**
 * `/app/products` was a second catalogue that showed nothing until you searched.
 * It now opens Browse beside the chat with products on first view, carrying any
 * `?q=` so old links and shared searches still land on their results. A route,
 * not a page: under the `/app` layout a page's redirect streams as a 200.
 */
export function GET(request: NextRequest) {
  const query: Record<string, string[]> = {};
  for (const [key, value] of request.nextUrl.searchParams) (query[key] ??= []).push(value);
  return NextResponse.redirect(new URL(catalogueRedirectHref(query), request.url), 307);
}
