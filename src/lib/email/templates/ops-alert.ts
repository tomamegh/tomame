import type { AlertCandidate } from "@/features/ops/alert-rules";
import type { DailySummary } from "@/features/ops/daily-summary";
import {
  EMAIL_COLORS as C,
  appUrl,
  button,
  divider,
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
} from "./layout";

/**
 * The two operator emails (083): an alert when something breaks, and the
 * 07:00 summary. Written for a person reading on a phone between other
 * things: the verdict first, the numbers second, one button to /admin/ops.
 * Every dynamic string is escaped; error messages come from code and vendors.
 */

const BODY_FONT = "'Instrument Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const REASON =
  "You get this because your address is on the platform alert list (the ops_alert_recipients setting). An admin can change the list on the Content screen.";

function levelTag(level: string): string {
  const critical = level === "critical";
  const bg = critical ? C.tint : C.amberBg;
  const fg = critical ? C.coralStrong : C.amberInk;
  const cls = critical ? "tm-tint" : "tm-amber-bg";
  const fgCls = critical ? "tm-coral-text" : "tm-amber-text";
  return `<span class="${cls}" style="display:inline-block; background-color:${bg}; border-radius:999px; padding:2px 8px; font-size:11px; line-height:16px; font-weight:700; letter-spacing:0.4px; text-transform:uppercase;"><span class="${fgCls}" style="color:${fg};">${critical ? "Critical" : "Warning"}</span></span>`;
}

/** One alert: tag, title, one line of detail, and where to look. */
function alertItem(a: { level: string; title: string; detail: string; href?: string }): string {
  const href = a.href ? `${appUrl()}${a.href}` : null;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;">
  <tr>
    <td class="tm-panel" style="background-color:${C.paper}; border:1px solid ${C.border}; border-radius:12px; padding:14px 16px; font-family:${BODY_FONT};">
      <p style="margin:0 0 6px;">${levelTag(a.level)}</p>
      <p class="tm-ink" style="margin:0 0 4px; font-size:16px; line-height:22px; font-weight:700; color:${C.ink};">${escapeHtml(a.title)}</p>
      <p class="tm-text2" style="margin:0; font-size:14px; line-height:21px; color:${C.text2}; word-break:break-word;">${escapeHtml(a.detail)}</p>
      ${href ? `<p style="margin:8px 0 0; font-size:13px; line-height:18px;">${link(href, "Open")}</p>` : ""}
    </td>
  </tr>
</table>`;
}

function sectionTitle(text: string): string {
  return `<p class="tm-text3" style="margin:24px 0 8px; font-family:${BODY_FONT}; font-size:12px; line-height:16px; font-weight:700; letter-spacing:0.6px; text-transform:uppercase; color:${C.text3};">${text}</p>`;
}

export interface OpsAlertEmailData {
  subject: string;
  alerts: AlertCandidate[];
  /** Alerts beyond the per-email cap, counted rather than listed. */
  more: number;
  environment: string | null;
  generatedAt: string;
}

export function opsAlertTemplate(data: OpsAlertEmailData): RenderedEmail {
  const critical = data.alerts.filter((a) => a.level === "critical").length;
  const only = data.alerts.length === 1 ? data.alerts[0] : undefined;
  const title = only ? only.title : `${data.alerts.length} things need a look`;
  const when = new Date(data.generatedAt).toUTCString().replace(" GMT", " GMT (Accra)");

  return renderEmail(data.subject, {
    preheader: only ? only.detail.slice(0, 140) : `${critical} critical, ${data.alerts.length - critical} warning. Open the Health screen for the detail.`,
    body: `
      ${eyebrow(critical > 0 ? "Platform alert" : "Platform warning", critical > 0 ? "coral" : "amber")}
      ${heading(escapeHtml(title))}
      ${paragraph(`Checked at ${escapeHtml(when)}${data.environment ? ` on <strong>${escapeHtml(data.environment)}</strong>` : ""}.`)}
      ${data.alerts.map(alertItem).join("")}
      ${data.more > 0 ? muted(`And ${data.more} more on the Health screen.`) : ""}
      ${button(`${appUrl()}/admin/ops`, "Open the Health screen")}
      ${muted("The same alert is not emailed again for an hour. If it is still happening then, you will hear about it once more.")}
    `,
    reason: REASON,
    manageLink: false,
  });
}

// ── The daily summary ───────────────────────────────────────────────────────

const ghs = (n: number) => `GH&#8373;&nbsp;${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function categoryLabel(category: string): string {
  switch (category) {
    case "client_4xx":
      return "refused form";
    case "client_crash":
      return "screen crash";
    case "server_5xx":
    case "server":
      return "server";
    case "payment":
      return "payment";
    case "job":
      return "job";
    case "notification":
      return "notification";
    default:
      return category;
  }
}

export function opsDailySummaryTemplate(summary: DailySummary, subject: string, environment: string | null): RenderedEmail {
  const verdict =
    summary.status === "healthy"
      ? "Everything looked healthy"
      : summary.status === "critical"
        ? `${summary.attention.length} thing${summary.attention.length === 1 ? "" : "s"} need${summary.attention.length === 1 ? "s" : ""} attention`
        : `${summary.attention.length} thing${summary.attention.length === 1 ? "" : "s"} to look at`;
  const tone = summary.status === "healthy" ? "green" : summary.status === "critical" ? "coral" : "amber";

  const e = summary.errors;
  const n = summary.notifications;
  const orderStatuses = Object.entries(summary.orders.byStatus)
    .sort((a, b) => b[1] - a[1])
    .map(([s, c]) => `${c} ${escapeHtml(s.replace(/_/g, " "))}`)
    .join(", ");

  const top = e.top.length
    ? infoTable(
        e.top
          .map((t) =>
            infoRow(
              `${escapeHtml(t.message.slice(0, 120))}<br /><span class="tm-text3" style="color:${C.text3}; font-size:12px;">${escapeHtml(categoryLabel(t.category))}${t.source ? `, ${escapeHtml(t.source)}` : ""}${t.isNew ? ", new" : ""}</span>`,
              t.count === 1 ? "once" : `${t.count} times`,
            ),
          )
          .join(""),
      )
    : paragraph("No errors recorded.");

  const warehouse = summary.warehouse
    ? infoTable(
        [
          infoRow("Actions recorded", String(summary.warehouse.total)),
          ...Object.entries(summary.warehouse.byAction)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([action, count]) => infoRow(escapeHtml(action.replace(/_/g, " ")), String(count))),
        ].join(""),
      )
    : paragraph("Warehouse activity could not be read.");

  return renderEmail(subject, {
    preheader: `${summary.orders.created} orders, ${summary.payments.success} payments, ${e.serverErrors + e.paymentErrors + e.jobErrors} server errors in the last 24 hours.`,
    body: `
      ${eyebrow(`Daily health, ${escapeHtml(summary.date)}`, tone)}
      ${heading(escapeHtml(verdict))}
      ${paragraph(`The last 24 hours, to 07:00 Accra time${environment ? ` on <strong>${escapeHtml(environment)}</strong>` : ""}.`)}
      ${summary.attention.length ? `${sectionTitle("Needs attention")}${summary.attention.slice(0, 10).map(alertItem).join("")}` : ""}
      ${sectionTitle("Orders and money")}
      ${infoTable(
        [
          infoRow("Orders placed", `${summary.orders.created}${orderStatuses ? `<br /><span class="tm-text3" style="color:${C.text3}; font-size:12px; font-weight:500;">${orderStatuses}</span>` : ""}`),
          infoRow("Payments succeeded", `${summary.payments.success} (${ghs(summary.payments.successGhs)})`),
          infoRow("Payments failed", String(summary.payments.failed)),
          infoRow("Payments still pending", String(summary.payments.pending)),
        ].join(""),
      )}
      ${sectionTitle("Errors")}
      ${infoTable(
        [
          infoRow("Server errors (5xx)", String(e.serverErrors)),
          infoRow("Payment errors", String(e.paymentErrors)),
          infoRow("Background job errors", String(e.jobErrors)),
          infoRow("Refused forms (4xx)", String(e.clientRejections)),
          infoRow("Screen crashes", String(e.clientCrashes)),
          infoRow("New issues", String(e.newIssues)),
        ].join(""),
      )}
      ${sectionTitle("Most frequent")}
      ${top}
      ${sectionTitle("Background jobs")}
      ${infoTable(
        [
          infoRow("Healthy", `${summary.jobs.healthy} of ${summary.jobs.total}`),
          summary.jobs.stale.length ? infoRow("Stale", escapeHtml(summary.jobs.stale.join(", "))) : "",
          summary.jobs.failing.length ? infoRow("Failing or not reached", escapeHtml(summary.jobs.failing.join(", "))) : "",
        ].join(""),
      )}
      ${sectionTitle("Notifications")}
      ${infoTable(
        [
          infoRow("Email", `${n.email.sent} sent, ${n.email.failed} failed${n.email.pending ? `, ${n.email.pending} pending` : ""}`),
          infoRow("WhatsApp", `${n.whatsapp.sent} sent, ${n.whatsapp.failed} failed${n.whatsapp.pending ? `, ${n.whatsapp.pending} pending` : ""}`),
          infoRow("Alert emails sent", String(summary.alertEmails24h)),
        ].join(""),
      )}
      ${sectionTitle("Warehouse")}
      ${warehouse}
      ${divider()}
      ${button(`${appUrl()}/admin/ops`, "Open the Health screen")}
    `,
    reason: REASON,
    manageLink: false,
  });
}
