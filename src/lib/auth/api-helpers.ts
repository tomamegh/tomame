import { ApiSuccessResponse } from "@/types/api";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { apiCategory } from "@/lib/logger/error-category";
import { routeFromStack } from "@/lib/logger/route-source";

export { ApiFetchError, apiFetch } from "@/lib/api-client";


export class APIError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export function successResponse<T>(data: T, status = 200) {
  const body: ApiSuccessResponse<T> = { success: true, data };
  return NextResponse.json(body, { status });
}

/**
 * An APIError is answered with its own status and message: those messages are
 * written for the customer. Anything else is a bug or an infrastructure fault
 * whose message (a PostgREST string, a vendor error, a stack detail) is not
 * for the browser, so it is logged in full and answered generically.
 */
export function errorResponse(error: unknown, statusCode: number = 500) {
  if (error instanceof APIError) {
    // A deliberate 5xx (a vendor down, a write that did not land) is still an
    // outage. It used to be answered without a word to the log, so the one
    // kind of failure a route took the trouble to name was the one nobody saw.
    if (error.statusCode >= 500) {
      const route = routeFromStack(error.stack);
      logger.error(`API ${error.statusCode}: ${error.message}`, {
        source: route ? `api:${route}` : "api",
        category: apiCategory(route),
        status: error.statusCode,
      });
    }
    return NextResponse.json(
      { error: error.message, success: false },
      { status: error.statusCode },
    );
  }

  // The error's own words go into the message, not only the meta: the message
  // is what `error_events` groups on (062), and "Unhandled error in API route"
  // for every bug made all of them one issue whose count went up.
  const detail = error instanceof Error ? error.message : String(error);
  const route = error instanceof Error ? routeFromStack(error.stack) : null;
  logger.error(`Unhandled error in API route: ${detail}`.slice(0, 500), {
    source: route ? `api:${route}` : "api",
    category: apiCategory(route),
    status: statusCode,
    error: detail,
    name: error instanceof Error ? error.name : undefined,
    stack: error instanceof Error ? error.stack?.split("\n").slice(0, 5).join("\n") : undefined,
  });
  return NextResponse.json(
    { error: "Something went wrong", success: false },
    { status: statusCode },
  );
}
