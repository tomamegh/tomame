import { NextRequest, NextResponse } from "next/server";

import { RATE_LIMIT } from "@/config/security";
import { clientErrorReportSchema } from "@/features/ops/client-error-schema";
import { recordClientError } from "@/features/ops/client-errors.service";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/** A report is a few hundred bytes; anything much bigger is not one of ours. */
const MAX_BODY_BYTES = 4096;

/**
 * POST /api/ops/client-errors: the browser telling us a screen crashed or a
 * route refused what a form sent (see `src/lib/observability`).
 *
 * Public, because a visitor's crash matters as much as a customer's. The user
 * id is read from the session, never from the body. Always 204 once parsed,
 * and never logs its own failures through `logger.error`: a broken reporter
 * must not become the loudest issue on the list.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (!(await checkRateLimit(`client-errors:${ip}`, RATE_LIMIT.clientErrors)).allowed) {
      return new NextResponse(null, { status: 429 });
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 413 });

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return new NextResponse(null, { status: 400 });
    }
    const parsed = clientErrorReportSchema.safeParse(body);
    if (!parsed.success) return new NextResponse(null, { status: 400 });

    let userId: string | null = null;
    let role: string | null = null;
    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getClaims();
      // The role is the custom access token hook's claim (20260323010214).
      const claims = data?.claims as { sub?: unknown; app_metadata?: { role?: unknown } } | undefined;
      userId = typeof claims?.sub === "string" ? claims.sub : null;
      const claimed = claims?.app_metadata?.role;
      role = typeof claimed === "string" ? claimed : userId ? "user" : null;
    } catch {
      // Signed out, or the session could not be read: still worth recording.
    }

    recordClientError(parsed.data, { userId, role });
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
