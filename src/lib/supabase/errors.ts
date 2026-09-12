import "server-only";

// ── Error classification ─────────────────────────────────────────────────────

/**
 * Does this error mean the TABLE ITSELF is missing, rather than a transient
 * database problem?
 *
 * Most reads are wrapped in a warn-and-fall-back-to-defaults catch, which is
 * right for a blip — a half-empty footer beats a 500 — but wrong for an
 * un-migrated database. Without this distinction a production build against a
 * database missing migrations logs a handful of warnings, prints "Compiled
 * successfully" and exits 0, and the deploy renders a silently half-empty site:
 * no WhatsApp number, no support hours, no payment channels, empty FAQ and
 * testimonial sections, with nothing red in CI. A missing relation is a
 * deploy-ordering bug that must fail loudly and early.
 *
 * The two signals:
 *  - `PGRST205` — PostgREST could not find the table in its schema cache
 *    ("Could not find the table 'public.site_settings' in the schema cache").
 *  - `42P01` — Postgres SQLSTATE undefined_table, for anything reaching the
 *    database directly ('relation "site_settings" does not exist').
 *
 * Both the code and the message are checked, because `db/queries/**` re-throws
 * PostgREST failures as plain `Error`s carrying only the message text — the
 * structured `code` is gone by the time the service sees it.
 */
export function isSchemaMissingError(error: unknown): boolean {
  const code = errorCode(error);
  if (code === "PGRST205" || code === "42P01") return true;

  const message = errorMessage(error).toLowerCase();
  if (!message) return false;
  return (
    message.includes("pgrst205") ||
    message.includes("42p01") ||
    message.includes("could not find the table") ||
    /relation ".+" does not exist/.test(message)
  );
}

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}
