import { NextRequest, after } from "next/server";

import { listPastesForViewer } from "@/db/queries/extraction-requests";
import { getQuoteFacts } from "@/db/queries/extraction-cache";
import { listOpenAssistedRequestsByUrl } from "@/db/queries/assisted-requests";
import { extractProductSchema } from "@/features/extraction/schema";
import { enqueuePaste, runExtractionJob } from "@/features/extraction/services/extraction-queue.service";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { resolveViewer } from "@/lib/quote-session";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT } from "@/config/security";
import { toPasteStatus } from "@/features/extraction/services/paste-status";

// The response is immediate; `after()` keeps the invocation alive for the job,
// which is bounded by the chain's own 25 s budget.
export const maxDuration = 60;

/**
 * POST /api/pastes — put a link on the queue and answer straight away.
 *
 * This is the half of `POST /api/products/extract` that does not wait. That route
 * still exists and still returns a priced quote in one call; it is the right
 * thing when the customer is sitting on the quote screen watching for a price.
 * This one is for pasting and walking away: it returns as soon as the row exists,
 * and the work runs behind the response.
 *
 * A product-keyed cache hit comes back `ready` with the extraction id already on
 * it, so the common case never schedules anything.
 *
 * Public, like the rest of the quote flow: a signed-out visitor is minted a
 * `tm_quote_session` cookie so the row has an owner to come back to.
 */
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });

    const parsed = extractProductSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const user = await getAuthenticatedUser();
    const { viewer, finalize } = resolveViewer(request, user?.id ?? null);

    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`paste:${ip}`, RATE_LIMIT.extraction).allowed) {
      throw new APIError(429, "Too many requests. Please wait a few minutes and try again.");
    }

    const enqueued = await enqueuePaste(viewer, parsed.data.product_url);
    if (!enqueued) throw new APIError(400, "We could not queue that link. Please try again.");

    // Start it here rather than waiting for the sweep: the customer is still on
    // the page and a minute of queue latency would undo the point of this route.
    // The claim is guarded, so this racing the sweeper is safe and expected.
    if (!enqueued.ready) after(() => runExtractionJob(enqueued.request.id));

    const [facts, assisted] = await Promise.all([
      getQuoteFacts([enqueued.request.extraction_cache_id ?? ""]),
      listOpenAssistedRequestsByUrl(viewer, [enqueued.request.product_url]),
    ]);
    return finalize(
      successResponse(
        toPasteStatus(
          enqueued.request,
          facts.get(enqueued.request.extraction_cache_id ?? ""),
          assisted.get(enqueued.request.product_url) ?? null,
        ),
        201,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * GET /api/pastes — everything this viewer has pasted lately.
 *
 * The Buy-for-me screen polls this while anything is still reading. Scoped to the
 * viewer, so a signed-out visitor sees exactly the links they pasted under their
 * own `tm_quote_session` cookie and nobody else's.
 */
export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`pastes-list:${ip}`, RATE_LIMIT.general).allowed) {
      throw new APIError(429, "Too many requests");
    }

    const user = await getAuthenticatedUser();
    const { viewer, finalize } = resolveViewer(request, user?.id ?? null);

    const rows = await listPastesForViewer(viewer);
    // One read each for the whole page rather than one per row.
    const [facts, assisted] = await Promise.all([
      getQuoteFacts(rows.map((r) => r.extraction_cache_id ?? "")),
      listOpenAssistedRequestsByUrl(viewer, rows.map((r) => r.product_url)),
    ]);
    return finalize(
      successResponse(
        rows.map((r) =>
          toPasteStatus(r, facts.get(r.extraction_cache_id ?? ""), assisted.get(r.product_url) ?? null),
        ),
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
