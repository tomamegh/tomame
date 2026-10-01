import {
  appUrl,
  button,
  escapeHtml,
  eyebrow,
  heading,
  infoRow,
  infoTable,
  link,
  muted,
  paragraph,
  renderEmail,
  type RenderedEmail,
  type Tone,
} from "./layout";

/**
 * The staff order email (087): one event on one order, bag, payment or car.
 * Read on a phone by somebody who has to act on it: what happened first, then
 * who, what and how much, then one button into the admin screen. Every dynamic
 * string is escaped; product names come from scraped store pages.
 */

const REASON =
  "You get this because your address is on the staff order alert list. An admin can change the list, or which events it covers, on the Notifications screen.";

export interface StaffAlertItem {
  name: string;
  quantity: number;
  reference: string | null;
  /** Path under the app, e.g. /admin/orders/<id>. */
  href: string | null;
}

export interface StaffAlertEmailData {
  subject: string;
  eyebrow: string;
  tone: Tone;
  headline: string;
  summary: string;
  customer: { name: string | null; email: string | null; phone: string | null } | null;
  items: StaffAlertItem[];
  totalGhs: number | null;
  payment: { reference: string; status: string; channel: string | null } | null;
  /** Extra label/value rows: from/to status, tracking, review outcome. */
  facts: [string, string][];
  adminHref: string;
  adminLabel: string;
  environment: string | null;
}

/** "GH₵1,234.00", the figure the subject and the body both print. */
export function formatStaffGhs(n: number): string {
  return `GH₵${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function itemRow(item: StaffAlertItem): string {
  const ref = item.reference ? ` <span style="color:#8a7f79;">(${escapeHtml(item.reference)})</span>` : "";
  const name = escapeHtml(item.name.slice(0, 160));
  const label = item.href ? link(`${appUrl()}${item.href}`, name) : name;
  return infoRow(`${label}${ref}`, `× ${item.quantity}`);
}

export function staffOrderAlertTemplate(data: StaffAlertEmailData): RenderedEmail {
  const c = data.customer;
  const customerRows = c
    ? [
        infoRow("Customer", escapeHtml(c.name ?? "No name on the account")),
        infoRow("Email", c.email ? link(`mailto:${c.email}`, escapeHtml(c.email)) : "Not available"),
        infoRow("Phone", c.phone ? link(`tel:${c.phone.replace(/[^\d+]/g, "")}`, escapeHtml(c.phone)) : "Not given"),
      ]
    : [];
  const moneyRows = [
    ...(data.totalGhs != null ? [infoRow("Total", `<strong>${escapeHtml(formatStaffGhs(data.totalGhs))}</strong>`)] : []),
    ...(data.payment
      ? [
          infoRow("Payment reference", escapeHtml(data.payment.reference)),
          infoRow(
            "Payment status",
            escapeHtml(`${data.payment.status}${data.payment.channel ? `, ${data.payment.channel.replace(/_/g, " ")}` : ""}`),
          ),
        ]
      : []),
  ];

  return renderEmail(data.subject, {
    preheader: data.summary.slice(0, 140),
    body: `
      ${eyebrow(escapeHtml(data.eyebrow), data.tone)}
      ${heading(escapeHtml(data.headline))}
      ${paragraph(`${escapeHtml(data.summary)}${data.environment ? ` <strong>(${escapeHtml(data.environment)})</strong>` : ""}`)}
      ${data.facts.length ? infoTable(data.facts.map(([k, v]) => infoRow(escapeHtml(k), escapeHtml(v))).join("")) : ""}
      ${customerRows.length ? infoTable(customerRows.join("")) : ""}
      ${data.items.length ? infoTable(data.items.slice(0, 20).map(itemRow).join("")) : ""}
      ${data.items.length > 20 ? muted(`And ${data.items.length - 20} more items.`) : ""}
      ${moneyRows.length ? infoTable(moneyRows.join("")) : ""}
      ${button(`${appUrl()}${data.adminHref}`, data.adminLabel)}
    `,
    reason: REASON,
    manageLink: false,
  });
}
