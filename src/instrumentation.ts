import type { Instrumentation } from "next";

/**
 * Errors Next.js caught itself: a server component that threw while rendering,
 * a server action, a route handler with no try/catch of its own. None of them
 * pass through `errorResponse`, so before this they reached the function log
 * and nothing else, and the customer saw an error screen with a digest nobody
 * could look up. They now land in `error_events` (062) beside everything else.
 *
 * Node only: the sink uses the service-role client, which the edge bundle must
 * not carry. Never throws (the sink swallows its own failures).
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const err = error instanceof Error ? (error as Error & { digest?: string }) : null;
    // Redirects and not-found are control flow that happens to be thrown.
    if (err?.digest?.startsWith("NEXT_") || err?.message === "NEXT_REDIRECT" || err?.message === "NEXT_NOT_FOUND") return;

    const { captureError } = await import("@/lib/logger/error-sink");
    const { apiCategory } = await import("@/lib/logger/error-category");
    const kind = context.routeType === "route" ? "api" : context.routeType === "action" ? "action" : "render";
    const message = err?.message ?? String(error);
    captureError({
      level: "error",
      message: `${kind === "render" ? "Screen failed to render" : kind === "action" ? "Server action failed" : "Route handler threw"}: ${message}`.slice(0, 500),
      category: kind === "api" ? apiCategory(context.routePath) : "server_5xx",
      meta: {
        source: `${kind}:${context.routePath}`,
        method: request.method,
        digest: err?.digest,
        renderSource: context.renderSource,
        stack: err?.stack?.split("\n").slice(0, 5).join("\n"),
      },
    });
  } catch {
    // The request is already failing; reporting it must not add a second fault.
  }
};
