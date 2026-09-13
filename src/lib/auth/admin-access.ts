/**
 * Who may reach `/admin` — the single rule.
 *
 * Pure and dependency-free so the proxy (which runs before any server module is
 * loaded) and the navbars can share it. Framework-free for the same reason.
 *
 * WHY THIS EXISTS. There used to be two rules and they contradicted each other:
 *
 * - `canAccessAdmin` required role `admin` AND an `@tomame.ca` address. Not one
 *   admin in the database has such an address — they are on `@tomame.local` and
 *   gmail — so the predicate answered false for every real administrator and the
 *   "Admin" link never appeared for anybody, including the owner's own account.
 * - `src/lib/supabase/proxy.ts` gated the ROUTE on role `admin` OR an
 *   `@tomame.ca` address. That is the same clause with the opposite polarity: it
 *   let anyone holding a tomame.ca mailbox into the admin UI with no admin role
 *   at all, which is precisely what the role column exists to decide.
 *
 * So the domain is gone. The role is the authority — the same thing every
 * `/api/admin/*` route already checks — and one function now answers the
 * question everywhere, so the two halves cannot drift apart again.
 *
 * The role is read from the JWT, where `custom_access_token_hook` puts it, so
 * this needs no database call. NOTE: that hook is commented out in the local
 * `supabase/config.toml`, so on a local stack `app_metadata.role` is unset and
 * every admin surface 403s until it is set by hand — see the release status doc.
 */

/**
 * The shape both callers have: a decoded JWT, or a Supabase user. `app_metadata`
 * is an open bag of claims in both (`UserAppMetadata` is an index signature), so
 * this is deliberately structural rather than naming either concrete type — the
 * proxy and the navbars hold different ones.
 */
export interface AdminAccessSubject {
  app_metadata?: Record<string, unknown> | null;
}

export function canAccessAdmin(subject: AdminAccessSubject | null | undefined): boolean {
  return subject?.app_metadata?.role === "admin";
}
