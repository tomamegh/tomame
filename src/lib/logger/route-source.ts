const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Which API route an error came through, read off its stack.
 *
 * `errorResponse` is called from some two hundred route handlers and is not
 * handed the request, so the stack is the one witness it has. Dev frames point
 * at `src/app/api/orders/[id]/route.ts`, production frames at
 * `.next/server/app/api/orders/[id]/route.js`; both carry the route's folder,
 * which is exactly the grouping wanted. Null when no frame is a route (an error
 * built far from its handler with no async frames kept).
 */
export function routeFromStack(stack: string | undefined): string | null {
  if (!stack) return null;
  const match = stack.match(/app[\\/]api[\\/]([^\s:()]+?)[\\/]route\.[cm]?[jt]sx?/);
  if (!match?.[1]) return null;
  return `/api/${match[1].replace(/\\/g, "/")}`;
}

/**
 * A request path with its variable parts folded, so `/api/orders/8d66…/pay`
 * and `/api/orders/c8c5…/pay` are one route in the error list, not two.
 */
export function normaliseRoutePath(path: string): string {
  const bare = path.split(/[?#]/)[0] ?? "";
  return bare
    .replace(UUID, ":id")
    .split("/")
    .map((seg) => (/^\d+$/.test(seg) || /^[A-Za-z0-9_-]{24,}$/.test(seg) ? ":id" : seg))
    .join("/")
    .slice(0, 200);
}
