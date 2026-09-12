import "server-only";
import { createPublicClient } from "@/lib/supabase/public";

// ── Row types ───────────────────────────────────────────────────────────────

/** Mirrors the `site_content_kind_check` constraint (036_create_marketing_content_tables.sql). */
export const SITE_CONTENT_KINDS = [
  "faq",
  "testimonial",
  "process_step",
  "value_prop",
  "feature_card",
  "fee_line",
  "compare_row",
  "stat",
  "trust_chip",
  "hero_copy",
  "store",
] as const;

export type SiteContentKind = (typeof SITE_CONTENT_KINDS)[number];

export interface SiteContentRow {
  id: string;
  kind: SiteContentKind;
  slug: string;
  locale: string;
  title: string | null;
  body: string | null;
  /** Free-form per-kind payload: icon names, ratings, value_source, … */
  data: Record<string, unknown>;
  sort_order: number;
}

/** Every kind is always present, so callers never index into `undefined`. */
export type SiteContentByKind = Record<SiteContentKind, SiteContentRow[]>;

export const DEFAULT_LOCALE = "en";

const COLUMNS = "id, kind, slug, locale, title, body, data, sort_order";

// ── Queries ─────────────────────────────────────────────────────────────────

/**
 * Published rows of one kind, in display order.
 * RLS already hides unpublished rows from anon; the explicit filter keeps an
 * admin session (which may write, and therefore read, drafts) on the same view.
 */
export async function getSiteContentByKind(
  kind: SiteContentKind,
  locale: string = DEFAULT_LOCALE,
): Promise<SiteContentRow[]> {
  const client = createPublicClient();
  const { data, error } = await client
    .from("site_content")
    .select(COLUMNS)
    .eq("kind", kind)
    .eq("locale", locale)
    .eq("is_published", true)
    .order("sort_order");

  if (error) {
    throw new Error(`Failed to load site content (${kind}): ${error.message}`);
  }

  return (data ?? []).map(normalizeRow);
}

/**
 * Several kinds in ONE round trip. The landing page needs six of them; six
 * sequential selects would be six network hops per render.
 */
export async function getSiteContentByKinds(
  kinds: readonly SiteContentKind[],
  locale: string = DEFAULT_LOCALE,
): Promise<SiteContentByKind> {
  const grouped = emptySiteContentByKind();
  if (kinds.length === 0) return grouped;

  const client = createPublicClient();
  const { data, error } = await client
    .from("site_content")
    .select(COLUMNS)
    .in("kind", [...kinds])
    .eq("locale", locale)
    .eq("is_published", true)
    .order("kind")
    .order("sort_order");

  if (error) {
    throw new Error(
      `Failed to load site content (${kinds.join(", ")}): ${error.message}`,
    );
  }

  for (const raw of data ?? []) {
    const row = normalizeRow(raw);
    grouped[row.kind].push(row);
  }
  return grouped;
}

/** One row by kind + slug, or null. Used for singletons such as `hero_copy`. */
export async function getSiteContentBySlug(
  kind: SiteContentKind,
  slug: string,
  locale: string = DEFAULT_LOCALE,
): Promise<SiteContentRow | null> {
  const client = createPublicClient();
  const { data, error } = await client
    .from("site_content")
    .select(COLUMNS)
    .eq("kind", kind)
    .eq("slug", slug)
    .eq("locale", locale)
    .eq("is_published", true)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to load site content (${kind}/${slug}): ${error.message}`,
    );
  }

  return data ? normalizeRow(data) : null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function emptySiteContentByKind(): SiteContentByKind {
  const grouped = {} as SiteContentByKind;
  for (const kind of SITE_CONTENT_KINDS) grouped[kind] = [];
  return grouped;
}

function normalizeRow(row: Record<string, unknown>): SiteContentRow {
  return {
    id: String(row.id),
    kind: row.kind as SiteContentKind,
    slug: String(row.slug),
    locale: String(row.locale),
    title: row.title != null ? String(row.title) : null,
    body: row.body != null ? String(row.body) : null,
    data:
      row.data != null && typeof row.data === "object"
        ? (row.data as Record<string, unknown>)
        : {},
    sort_order: Number(row.sort_order),
  };
}
