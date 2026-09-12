/**
 * Access control for the /builder screen.
 *
 * The builder accepts file uploads and writes them to storage, which is the
 * most dangerous surface in the app. It is therefore gated twice: this switch,
 * and an admin role check inside every route handler. Neither alone is enough —
 * this flag is not authentication, and the role check does not help if the
 * screen is left reachable on a public deployment.
 *
 *   BUILDER_ENABLED=false  → off everywhere. The kill switch: set this and the
 *                            route 404s even in development.
 *   BUILDER_ENABLED=true   → on, including production. Deliberate opt-in.
 *   unset                  → on in development, off in production.
 *
 * The default is chosen so the tool works on a laptop with no setup, but a
 * production deploy never exposes an upload endpoint by accident.
 */
export function isBuilderEnabled(): boolean {
  const flag = process.env.BUILDER_ENABLED?.trim().toLowerCase();
  if (flag === "false" || flag === "0") return false;
  if (flag === "true" || flag === "1") return true;
  return process.env.NODE_ENV !== "production";
}
