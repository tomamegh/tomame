import { ApiSuccessResponse } from "@/types/api";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

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
    return NextResponse.json(
      { error: error.message, success: false },
      { status: error.statusCode },
    );
  }

  logger.error("Unhandled error in API route", {
    error: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : undefined,
    stack: error instanceof Error ? error.stack?.split("\n").slice(0, 5).join("\n") : undefined,
  });
  return NextResponse.json(
    { error: "Something went wrong", success: false },
    { status: statusCode },
  );
}
