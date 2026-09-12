import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import type { Viewer } from "@/features/quotes/types";

/**
 * The anonymous quote identity. The quote flow is public, but a rate lock has to
 * belong to someone, so a signed-out visitor gets a server-minted, httpOnly
 * UUID. The browser cannot read it and never sends it in a body — the server
 * reads the cookie itself — so a client cannot claim another visitor's lock.
 */
export const QUOTE_SESSION_COOKIE = "tm_quote_session";

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A cookie value as a quote session id, or null when absent or not a UUID we minted. */
export function parseQuoteSession(value: string | null | undefined): string | null {
  return value && UUID_RE.test(value) ? value : null;
}

/** The cookie's value from a request, or null. */
export function readQuoteSession(request: NextRequest): string | null {
  return parseQuoteSession(request.cookies.get(QUOTE_SESSION_COOKIE)?.value);
}

/** Any cookie store with `get(name)` — `next/headers`' `cookies()` in a Server Component, for one. */
export interface QuoteSessionCookieStore {
  get(name: string): { value: string } | undefined;
}

/** The cookie's value from a cookie store (Server Components have no request), or null. */
export function readQuoteSessionFromCookies(cookieStore: QuoteSessionCookieStore): string | null {
  return parseQuoteSession(cookieStore.get(QUOTE_SESSION_COOKIE)?.value);
}

export function mintQuoteSessionId(): string {
  return crypto.randomUUID();
}

export function attachQuoteSessionCookie<T extends NextResponse>(response: T, sessionId: string): T {
  response.cookies.set({
    name: QUOTE_SESSION_COOKIE,
    value: sessionId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: THIRTY_DAYS_SECONDS,
  });
  return response;
}

export interface ResolvedViewer {
  viewer: Viewer;
  /**
   * Hand the route's response through here before returning it: when this
   * request minted a new session, the cookie is attached; otherwise the
   * response passes untouched. Routes never track the minted id themselves.
   */
  finalize<T extends NextResponse>(response: T): T;
}

/**
 * Who is asking: the signed-in user (if any) plus the quote cookie (if any). A
 * visitor with neither gets a fresh session so the lock minted for this quote
 * has an owner. A signed-in user without a cookie needs none.
 */
export function resolveViewer(request: NextRequest, userId: string | null): ResolvedViewer {
  const existing = readQuoteSession(request);
  if (existing || userId) {
    return { viewer: { userId, sessionId: existing }, finalize: (response) => response };
  }
  const minted = mintQuoteSessionId();
  return {
    viewer: { userId: null, sessionId: minted },
    finalize: (response) => attachQuoteSessionCookie(response, minted),
  };
}
