import "server-only";
import { getQuoteAssuranceContent } from "@/db/queries/site-content";
import type { QuoteAssurance } from "../types";

/**
 * The three cards under the landed-price receipt, from `site_content`
 * (kind `quote_assurance`, seeded by migration 047).
 *
 * The copy is admin-editable on purpose — "Money held / until we buy it" is a
 * promise about the customer's money and must be able to follow the policies
 * without a deploy. Only the *shape* is decided here: the row's `data.icon`
 * travels as a plain string and is resolved by an explicit map in the
 * component, because a database that can name an arbitrary icon component is a
 * database that can break the build.
 *
 * A row with no title is dropped rather than rendered as an empty card.
 */
export async function loadQuoteAssurances(): Promise<QuoteAssurance[]> {
  const rows = await getQuoteAssuranceContent();

  return rows.flatMap((row) => {
    const title = row.title?.trim();
    if (!title) return [];
    return [
      {
        slug: row.slug,
        title,
        body: row.body?.trim() || null,
        icon: readString(row.data.icon),
        href: readHref(row.data.href),
      },
    ];
  });
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * `data.href` becomes an anchor's target, so only an in-app path or an http(s)
 * URL is accepted. An admin editing content should not be able to author a
 * `javascript:` link into the screen where the customer commits to a payment.
 */
function readHref(value: unknown): string | null {
  const href = readString(value);
  if (!href) return null;
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  return /^https?:\/\//i.test(href) ? href : null;
}
