import Link from "next/link";
import { WhatsappLogo } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";
import {
  buildFooterColumns,
  buildLegalColumn,
  columnHeadingId,
  formatCopyright,
  formatPaymentChannels,
  formatSupportLine,
  whatsappHref,
} from "./links";
import { FOCUS_RING } from "./styles";
import type {
  MarketingFooterColumn,
  MarketingLink,
  MarketingPolicyLink,
  MarketingSiteSettings,
} from "./types";

import { Logo } from "@/components/brand/logo";

/**
 * Positioning line. Not covered by `site_settings` today, so it stays an
 * overridable prop rather than a literal buried in the markup.
 */
export const DEFAULT_MARKETING_TAGLINE =
  "Personal shopping from the USA, paid in cedis and delivered in Ghana. UK and China coming soon.";

export interface MarketingFooterProps {
  /** `site_settings` rows: whatsapp_number, support_hours, company_address, payment_channels. */
  settings: MarketingSiteSettings;
  /** Published `policies` rows — drives the Legal column. */
  policies: readonly MarketingPolicyLink[];
  tagline?: string;
  /** Override Shop / Help / Company; Legal always comes from `policies`. */
  columns?: readonly MarketingFooterColumn[];
  className?: string;
}

function FooterLinkItem({ link }: { link: MarketingLink }) {
  const className = cn(
    "rounded-sm transition-colors duration-200 hover:text-tm-ink",
    FOCUS_RING,
  );

  if (link.external) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {link.label}
      </a>
    );
  }

  return (
    <Link href={link.href} className={className}>
      {link.label}
    </Link>
  );
}

function FooterColumn({ column }: { column: MarketingFooterColumn }) {
  const headingId = columnHeadingId(column.heading);

  return (
    <nav aria-labelledby={headingId} className="flex flex-col gap-1.5">
      <h2
        id={headingId}
        className="font-sans text-sm font-bold tracking-normal text-tm-ink"
      >
        {column.heading}
      </h2>
      <ul className="flex flex-col gap-1.5">
        {column.links.map((link) => (
          <li key={`${link.label}-${link.href}`}>
            <FooterLinkItem link={link} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Shared marketing footer — design/TmMarketingFooter.dc.html.
 *
 * Every fact on this surface is passed in: the WhatsApp number and support
 * hours, the company address, the payment channel list and the legal links all
 * come from the database, and the copyright year is computed at render time.
 */
export function MarketingFooter({
  settings,
  policies,
  tagline = DEFAULT_MARKETING_TAGLINE,
  columns,
  className,
}: MarketingFooterProps) {
  const { whatsappNumber, supportHours, companyAddress, paymentChannels } =
    settings;

  const linkColumns = columns ?? buildFooterColumns(whatsappNumber);
  const legalColumn = buildLegalColumn(policies);
  const allColumns =
    legalColumn.links.length > 0 ? [...linkColumns, legalColumn] : linkColumns;

  const supportLine = formatSupportLine(whatsappNumber, supportHours);
  const chatHref = whatsappHref(whatsappNumber);
  const channels = formatPaymentChannels(paymentChannels);
  const copyright = formatCopyright(new Date().getFullYear(), companyAddress);

  const supportPill = (
    <>
      {/* WhatsApp brand green — an external mark, not a theme colour. */}
      <WhatsappLogo size={16} weight="fill" className="text-[#25D366]" />
      {supportLine}
    </>
  );
  const supportPillClass = cn(
    "inline-flex w-fit items-center gap-2 whitespace-nowrap rounded-full bg-tm-green-bg px-3 py-2 text-xs font-semibold leading-none text-tm-green-ink",
    FOCUS_RING,
  );

  return (
    <footer
      className={cn(
        "border-t border-tm-hairline bg-card text-sm leading-[1.7] text-tm-text-2",
        "flex flex-col gap-10 px-5 pt-12 pb-8 md:px-8 md:pt-14 md:pb-10",
        className,
      )}
    >
      <div className="mx-auto grid w-full max-w-[1280px] gap-8 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
        <div className="flex flex-col gap-3 sm:col-span-2 lg:col-span-1">
          <Link
            href="/"
            aria-label="Tomame home"
            className={cn("w-fit rounded-sm", FOCUS_RING)}
          >
            <Logo variant="lockup" height={110} decorative />
          </Link>

          <p className="max-w-[260px]">{tagline}</p>

          {supportLine ? (
            chatHref ? (
              <a
                href={chatHref}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  supportPillClass,
                  "transition-colors duration-200 hover:bg-tm-green-bg/70",
                )}
              >
                {supportPill}
              </a>
            ) : (
              <span className={supportPillClass}>{supportPill}</span>
            )
          ) : null}
        </div>

        {allColumns.map((column) => (
          <FooterColumn key={column.heading} column={column} />
        ))}
      </div>

      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-3 border-t border-tm-hairline pt-5 text-[13px] sm:flex-row sm:items-center sm:justify-between">
        <span>{copyright}</span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>Payments by Paystack</span>
          {channels ? (
            <>
              <span
                aria-hidden="true"
                className="hidden size-1 rounded-full bg-tm-text-3/40 sm:block"
              />
              <span>{channels}</span>
            </>
          ) : null}
        </span>
      </div>
    </footer>
  );
}
