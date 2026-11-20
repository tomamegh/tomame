import { NextRequest, after } from "next/server";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { finderLimitMessage, finderRateLimit } from "@/features/finder/admission";
import { startFinderSchema } from "@/features/finder/schema";
import { FinderNotAdmittedError, runFinderJob, startFinderRun } from "@/features/finder/services/finder-run.service";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit, rateLimitSubject } from "@/lib/rate-limit";
import { resolveViewer } from "@/lib/quote-session";

// The response is immediate; `after()` keeps the invocation alive for the run,
// which stops starting new work at FINDER.deadlineMs (210 s).
export const maxDuration = 300;

/**
 * POST /api/finder — "Tell us what you want". Starts a price finder run and
 * answers with its id straight away; the work runs behind the response.
 *
 * Public like the quote flow: a visitor is minted the `tm_quote_session`
 * cookie so the run has an owner. The same request from the same viewer
 * inside 24 h returns the earlier run (200) and is not counted; a fresh run
 * (201) is rate limited per signed-in user, or per IP for a visitor.
 */
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = startFinderSchema.safeParse(body);
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");

    const user = await getAuthenticatedUser();
    const { viewer, finalize } = resolveViewer(request, user?.id ?? null);
    const limit = finderRateLimit(rateLimitSubject(request, user?.id), user != null);

    let started: Awaited<ReturnType<typeof startFinderRun>>;
    try {
      started = await startFinderRun(
        viewer,
        {
          query: parsed.data.query,
          budgetGhs: parsed.data.budget_ghs ?? null,
          email: user ? null : parsed.data.email ?? null,
          notifyWhatsapp: parsed.data.notify_whatsapp ?? false,
        },
        async () => (await checkRateLimit(limit.key, limit.config)).allowed,
      );
    } catch (error) {
      if (error instanceof FinderNotAdmittedError) throw new APIError(429, finderLimitMessage(user != null));
      throw error;
    }

    if (!started.reused) after(() => runFinderJob(started.run.id));
    return finalize(successResponse({ id: started.run.id, reused: started.reused }, started.reused ? 200 : 201));
  } catch (error) {
    return errorResponse(error);
  }
}
