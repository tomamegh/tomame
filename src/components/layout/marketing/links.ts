/**
 * Pure link/label helpers for the marketing nav + footer.
 *
 * Everything here is side-effect free and framework free so it can be unit
 * tested without a DOM. The components below only render what these return.
 */

import type {
  MarketingFooterColumn,
  MarketingNavItem,
  MarketingNavKey,
  MarketingPolicyLink,
} from "./types";

/** Top-level marketing destinations, in the order the design shows them. */
export const MARKETING_NAV_ITEMS: readonly MarketingNavItem[] = [
  { key: "how", label: "How it works", href: "/how-it-works" },
  { key: "regions", label: "Where we buy", href: "/where-we-buy" },
  { key: "fees", label: "Fees", href: "/fees" },
  { key: "faq", label: "FAQ", href: "/faq" },
  { key: "about", label: "About", href: "/about" },
] as const;

/** Reading order for the legal column, mirroring the public policies page. */
export const LEGAL_SLUG_ORDER: readonly string[] = [
  "privacy",
  "terms",
  "shipping",
  "returns",
  "payment",
] as const;

/**
 * Which nav item the current route belongs to, or `null` on the home page and
 * any route outside the marketing nav. A nested route (`/fees/example`) keeps
 * its parent highlighted.
 */
export function resolveActiveNavKey(
  pathname: string | null,
  items: readonly MarketingNavItem[] = MARKETING_NAV_ITEMS,
): MarketingNavKey | null {
  if (!pathname) return null;
  const match = items.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  return match?.key ?? null;
}

/**
 * `https://wa.me/<digits>` for a stored number in any human format
 * (`+233 24 555 0192`). Returns `null` when there is nothing dialable, so the
 * caller can fall back to plain text.
 */
export function whatsappHref(rawNumber: string | null): string | null {
  if (!rawNumber) return null;
  const digits = rawNumber.replace(/\D/g, "");
  return digits.length > 0 ? `https://wa.me/${digits}` : null;
}

/** `+233 24 555 0192 · 8am–10pm`, dropping either half when it is missing. */
export function formatSupportLine(
  whatsappNumber: string | null,
  supportHours: string | null,
): string | null {
  const parts = [whatsappNumber, supportHours].filter(
    (part): part is string => Boolean(part && part.trim()),
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** `MTN MoMo · Telecel Cash · AT Money · Visa · Mastercard`. */
export function formatPaymentChannels(
  channels: readonly string[],
): string | null {
  const cleaned = channels
    .map((channel) => channel.trim())
    .filter((channel) => channel.length > 0);
  return cleaned.length > 0 ? cleaned.join(" · ") : null;
}

/** `© 2026 Tomame. Accra, Ghana.` — the year is always passed in, never literal. */
export function formatCopyright(
  year: number,
  companyAddress: string | null,
): string {
  const address = companyAddress?.trim();
  return address ? `© ${year} Tomame. ${address}.` : `© ${year} Tomame.`;
}

/**
 * The Shop / Help / Company columns. The WhatsApp entry is derived from the
 * stored number and is dropped entirely when no number is configured.
 */
export function buildFooterColumns(
  whatsappNumber: string | null,
): readonly MarketingFooterColumn[] {
  const chat = whatsappHref(whatsappNumber);

  return [
    {
      heading: "Shop",
      links: [
        { label: "How it works", href: "/how-it-works" },
        { label: "Where we buy", href: "/where-we-buy" },
        { label: "Fees", href: "/fees" },
        { label: "Stores we read", href: "/where-we-buy#stores" },
      ],
    },
    {
      heading: "Help",
      links: [
        { label: "FAQ", href: "/faq" },
        { label: "Track a journey", href: "/app/orders" },
        { label: "Contact", href: "/contact" },
        ...(chat
          ? [{ label: "WhatsApp", href: chat, external: true as const }]
          : []),
      ],
    },
    {
      heading: "Company",
      links: [
        { label: "About", href: "/about" },
        { label: "Blog", href: "/blog" },
        { label: "Careers", href: "/careers" },
      ],
    },
  ];
}

/**
 * The Legal column, built from published `policies` rows: labels and slugs are
 * admin-owned, the anchor targets the public policies page. Known slugs keep
 * the canonical reading order; anything else is appended alphabetically.
 */
export function buildLegalColumn(
  policies: readonly MarketingPolicyLink[],
): MarketingFooterColumn {
  const ordered = [...policies].sort((a, b) => {
    const ai = LEGAL_SLUG_ORDER.indexOf(a.slug);
    const bi = LEGAL_SLUG_ORDER.indexOf(b.slug);
    if (ai === -1 && bi === -1) return a.slug.localeCompare(b.slug);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return {
    heading: "Legal",
    links: ordered.map((policy) => ({
      label: policy.label,
      href: `/policies#${policy.slug}`,
    })),
  };
}

/** Stable DOM id for a column heading, used to label its nav landmark. */
export function columnHeadingId(heading: string): string {
  return `footer-${heading.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
