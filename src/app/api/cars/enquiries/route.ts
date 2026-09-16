import { NextRequest } from "next/server";
import * as z from "zod";

import { RATE_LIMIT } from "@/config/security";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { createCarEnquirySchema } from "@/features/cars/schema";
import {
  createCarEnquiry,
  listCarEnquiriesForCustomer,
} from "@/features/cars/services/cars.service";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { requireAuth } from "@/lib/auth/guards";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Which listing the enquiry is about.
 *
 * DEFINED INLINE RATHER THAN ADDED TO `features/cars/schema.ts`, the way
 * `carIdSchema` is used by the admin routes. `createCarEnquirySchema` there
 * describes the BODY OF AN ENQUIRY — kind, amount, message — and is shared with
 * the service's input type; which car it is about is a property of this route's
 * URL shape, not of an enquiry, and the admin routes take their ids the same
 * way.
 *
 * It is a separate parse rather than an `.extend()` because
 * `createCarEnquirySchema` is a refined object (`superRefine` enforces the
 * amount rule), and a refined schema has no `.extend()`.
 *
 * `createCarEnquirySchema`'s own comment says "the listing id is a path
 * segment", which describes a `/api/cars/:id/enquiries` shape this route is
 * not. The collection endpoint is what the customer screens call, and the half
 * of that comment that still governs is the half that matters: neither the id
 * nor the user is taken from a field the browser could have forged into the
 * enquiry body — the id is validated as a UUID here and checked against a
 * PUBLISHED listing by the service, and the user comes from the session.
 */
const enquiryTargetSchema = z.object({
  car_listing_id: z.uuid("Which car is this about?"),
});

/**
 * POST /api/cars/enquiries — a customer asks about a car, or offers for one.
 *
 * HTTP only: authenticate, rate limit, parse, status code. Every rule that
 * matters is below this file — `createCarEnquiry` checks the kind against the
 * LISTING's price state (a CHECK constraint cannot see another row), and
 * `car_enquiries_kind_amount` guarantees an offer carries an amount and a price
 * request does not.
 *
 * AUTH IS CUSTOMER, NOT ADMIN, and it is asked for HERE rather than by the
 * proxy. `/app/cars` is in `publicRoutes` on purpose: a car listing is the link
 * a buyer sends to somebody who has never heard of Tomame, and a login wall in
 * front of the photographs is the feature failing at its one job. So looking is
 * open and acting is not, and this route is half of where that line is drawn
 * (`/api/cars/checkout` is the other half).
 *
 * THE USER ID COMES FROM THE SESSION AND NEVER FROM THE BODY. The service takes
 * a `CarCustomer` and writes `user_id` from it; the schema has no field for one.
 * CLAUDE.md: never trust a client-provided user_id.
 *
 * WHY `RATE_LIMIT.assisted` AND NOT `general`. Every row this writes is a job a
 * person has to work — somebody has to price a car or answer an offer — which
 * is the same argument the "Tell us what you want" budget was set on, and the
 * same order of magnitude of consequence. Six an hour is far more negotiating
 * than any real customer does and bounds a script that would otherwise put
 * sixty offers into the queue. The bucket is keyed by USER rather than IP: a
 * signed-in customer is already identified, and several customers behind one
 * Ghanaian mobile NAT must not share a budget.
 *
 * `uq_car_enquiries_live` already stops the ordinary duplicate — one live
 * enquiry per customer per car, surfaced as a 409 with the query layer's own
 * sentence — so this budget is for abuse, not for double-taps.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);

    if (!checkRateLimit(`car-enquiry-create:${auth.id}`, RATE_LIMIT.assisted).allowed) {
      throw new APIError(
        429,
        "That is a lot of enquiries in one hour. Give us a chance to answer the ones you have already sent.",
      );
    }

    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });

    const target = enquiryTargetSchema.safeParse(body);
    if (!target.success) {
      throw new APIError(400, target.error.issues[0]?.message ?? "Invalid input");
    }

    const parsed = createCarEnquirySchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const enquiry = await createCarEnquiry(
      { id: auth.id, email: auth.email ?? null },
      target.data.car_listing_id,
      parsed.data,
    );

    // 201: this always creates a row. The duplicate case does not reach here —
    // `insertCarEnquiry` raises `CarEnquiryExistsError`, which the service maps
    // to a 409 rather than returning the existing row, because an offer is a
    // statement made at a moment and quietly reusing an older one would
    // misreport when it was made.
    return successResponse(enquiry, 201);
  } catch (error) {
    return errorResponse(error);
  }
}


/**
 * GET /api/cars/enquiries — the enquiries the signed-in customer has made.
 *
 * WHY IT EXISTS. Without it the concierge half of this feature is one-way: a
 * customer offers GH₵190,000 for a car, the tab closes, and the offer is gone
 * from their world entirely — there is no screen, no email and no receipt, only
 * a row in a queue an admin can see. They cannot tell whether we ever got it,
 * whether it was answered, or what they offered. An offer is a statement about
 * money and the person who made it has to be able to look at it again.
 *
 * SCOPED BY SESSION, NEVER BY A PARAMETER. `listCarEnquiriesForCustomer` takes
 * the customer and sets `userId` itself, so there is no query string that could
 * widen this to somebody else's offers — the admin queue is a separate,
 * admin-gated route (`/api/admin/cars/enquiries`). CLAUDE.md: never trust a
 * client-provided user_id.
 *
 * Not rate limited beyond the proxy's own budget: it is a read of the caller's
 * own rows, and the POST beside it is where the cost of abuse actually lands.
 */
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);

    const { enquiries, total } = await listCarEnquiriesForCustomer({
      id: auth.id,
      email: auth.email ?? null,
    });

    return successResponse({ enquiries, total });
  } catch (error) {
    return errorResponse(error);
  }
}
