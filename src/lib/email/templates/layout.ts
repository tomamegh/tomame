import { htmlToText } from "../plain-text";

/**
 * The shared shell every Tomame email is built on, app mail (Resend) and the
 * Supabase auth mail in `supabase/templates/` alike.
 *
 * EMAIL, NOT A WEB PAGE. Clients strip `<link>`, most ignore web fonts, Outlook
 * renders with Word and needs tables and VML, and Gmail keeps only a `<style>`
 * block it can scope. So: one 600px column of nested tables, every visual
 * decision inline, and the `<style>` block used only for what inline styles
 * cannot express (dark mode, the phone breakpoint). An email that loses the
 * `<style>` block must still read correctly — it does, in light colours.
 *
 * NO IMAGES. The wordmark is live text, so it survives blocked images, needs no
 * hosting and follows dark mode. It also keeps the parcel-photo email honest:
 * that message promises the customer there is no picture in it.
 *
 * Every dynamic value that is text goes through `escapeHtml` in the template
 * that places it — product titles come from scraped store pages and a buyer's
 * note is free text, so `<` or `&` in either must not break the markup.
 */

/** tm-* tokens from `src/app/globals.css`, resolved to literals for email. */
export const EMAIL_COLORS = {
  coral: "#f25b3d",
  coralStrong: "#c43e22",
  ink: "#2b2422",
  paper: "#fdf9f6",
  tint: "#fff1ec",
  green: "#1e9a5c",
  greenInk: "#15703f",
  greenBg: "#eef8f1",
  amber: "#c97a0a",
  amberInk: "#8a5300",
  amberBg: "#fff7ea",
  text2: "#6e625b",
  text3: "#8a7f79",
  border: "#f0e8e3",
  hairline: "#f5eee9",
  white: "#ffffff",
} as const;

const C = EMAIL_COLORS;

export const SITE_URL = "https://tomame.ca";
export const SUPPORT_EMAIL = "support@tomame.ca";

/** Where links into the app point: this deployment, or production when unset. */
export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || SITE_URL).replace(/\/+$/, "");
}

/** Bricolage Grotesque / Instrument Sans where installed, then safe system faces. */
const DISPLAY_FONT =
  "'Bricolage Grotesque', 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', Arial, sans-serif";
const BODY_FONT =
  "'Instrument Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const MONO_FONT = "'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Wraps markup the plain-text version must leave out (preheader, spacer glyphs). */
function textSkip(html: string) {
  return `<!--text:skip-->${html}<!--/text:skip-->`;
}

export interface EmailShell {
  /** The inbox preview line after the subject. One plain sentence. */
  preheader: string;
  /** Blocks built from the helpers below. */
  body: string;
  /** Why this person got this email. Plain HTML, shown small in the footer. */
  reason: string;
  /** Show the "manage notifications" link. Off for auth mail, which cannot be switched off. */
  manageLink?: boolean;
}

const DARK_MODE_CSS = `
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (prefers-color-scheme: dark) {
    .tm-bg { background-color: #161211 !important; }
    .tm-card { background-color: #211b19 !important; border-color: #3a302c !important; }
    .tm-panel { background-color: #2a2220 !important; border-color: #3a302c !important; }
    .tm-tint { background-color: #3a221b !important; }
    .tm-green-bg { background-color: #14291d !important; }
    .tm-amber-bg { background-color: #2e2412 !important; }
    .tm-ink { color: #f6efeb !important; }
    .tm-text2 { color: #cbbfb8 !important; }
    .tm-text3 { color: #a89c96 !important; }
    .tm-coral-text { color: #ff8a70 !important; }
    .tm-green-text { color: #6fd39c !important; }
    .tm-amber-text { color: #f2b75a !important; }
    .tm-rule { border-color: #3a302c !important; }
    .tm-dot-off { background-color: #3a302c !important; }
  }
  [data-ogsc] .tm-ink { color: #f6efeb !important; }
  [data-ogsc] .tm-text2 { color: #cbbfb8 !important; }
  [data-ogsc] .tm-text3 { color: #a89c96 !important; }
  [data-ogsc] .tm-coral-text { color: #ff8a70 !important; }
  @media only screen and (max-width: 620px) {
    .tm-pad { padding-left: 24px !important; padding-right: 24px !important; }
    .tm-h1 { font-size: 24px !important; line-height: 30px !important; }
    .tm-btn { width: 100% !important; }
    .tm-btn a { display: block !important; }
  }
`;

export function emailLayout(shell: EmailShell): string {
  const year = new Date().getFullYear();
  const manage = shell.manageLink === false
    ? ""
    : ` <a href="${appUrl()}/app/account" class="tm-text3" style="color:${C.text3}; text-decoration:underline;">Manage email notifications</a>.`;

  // Zero-width padding after the preheader stops clients pulling body copy into the preview.
  const preheaderPad = "&#8199;&#847; ".repeat(60);

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>Tomame</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>${DARK_MODE_CSS}</style>
</head>
<body class="tm-bg" style="margin:0; padding:0; width:100%; background-color:${C.paper}; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
  ${textSkip(`<div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:${C.paper}; opacity:0;">${escapeHtml(shell.preheader)}${preheaderPad}</div>`)}
  <table role="presentation" class="tm-bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.paper};">
    <tr>
      <td align="center" style="padding:32px 12px 40px;">
        <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; margin:0 auto;">
          <tr>
            <td class="tm-pad" style="padding:0 8px 20px;">
${textSkip(`<a href="${SITE_URL}" style="text-decoration:none; font-family:${DISPLAY_FONT}; font-size:28px; line-height:32px; font-weight:800; letter-spacing:-1px;"><span class="tm-ink" style="color:${C.ink};">tom</span><span class="tm-coral-text" style="color:${C.coral};">ame</span></a>`)}
            </td>
          </tr>
          <tr>
            <td class="tm-card" style="background-color:${C.white}; border:1px solid ${C.border}; border-radius:20px; overflow:hidden;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td height="4" style="height:4px; line-height:4px; font-size:4px; background-color:${C.coral}; background-image:linear-gradient(90deg, #f43f5e 0%, #f97316 60%, #f59e0b 100%); border-radius:20px 20px 0 0;">&nbsp;</td>
                </tr>
                <tr>
                  <td class="tm-pad" style="padding:36px 40px 40px; font-family:${BODY_FONT};">
                    ${shell.body}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="tm-pad" style="padding:28px 16px 0; font-family:${BODY_FONT};">
              <p class="tm-text2" style="margin:0 0 12px; font-size:14px; line-height:22px; color:${C.text2};">
                Questions? Write to <a href="mailto:${SUPPORT_EMAIL}" class="tm-coral-text" style="color:${C.coralStrong}; font-weight:600; text-decoration:none;">${SUPPORT_EMAIL}</a>. A real person reads every message.
              </p>
              <p class="tm-text3" style="margin:0 0 12px; font-size:12px; line-height:19px; color:${C.text3};">
                ${shell.reason}${manage}
              </p>
              <p class="tm-text3" style="margin:0; font-size:12px; line-height:19px; color:${C.text3};">
                <strong class="tm-text2" style="color:${C.text2};">Tomame</strong> &middot; Shop the world. Pay in cedis.<br />
                &copy; ${year} Tomame &middot; Accra, Ghana &middot; <a href="${SITE_URL}" class="tm-text3" style="color:${C.text3}; text-decoration:underline;">tomame.ca</a>
              </p>
            </td>
          </tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  /** Plain-text alternative, derived from `html` so the two can never drift. */
  text: string;
}

export function renderEmail(subject: string, shell: EmailShell): RenderedEmail {
  const html = emailLayout(shell);
  return { subject, html, text: htmlToText(html) };
}

/* ─── Blocks ─────────────────────────────────────────────────────────────── */

export type Tone = "coral" | "green" | "amber" | "neutral";

const TONES: Record<Tone, { bg: string; fg: string; bgClass: string; fgClass: string }> = {
  coral: { bg: C.tint, fg: C.coralStrong, bgClass: "tm-tint", fgClass: "tm-coral-text" },
  green: { bg: C.greenBg, fg: C.greenInk, bgClass: "tm-green-bg", fgClass: "tm-green-text" },
  amber: { bg: C.amberBg, fg: C.amberInk, bgClass: "tm-amber-bg", fgClass: "tm-amber-text" },
  neutral: { bg: C.paper, fg: C.text2, bgClass: "tm-panel", fgClass: "tm-text2" },
};

/** Small uppercase label above the heading: what kind of email this is. */
export function eyebrow(text: string, tone: Tone = "coral") {
  const t = TONES[tone];
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">
  <tr>
    <td class="${t.bgClass}" style="background-color:${t.bg}; border-radius:999px; padding:5px 12px; font-family:${BODY_FONT}; font-size:12px; line-height:16px; font-weight:700; letter-spacing:0.6px; text-transform:uppercase;">
      <span class="${t.fgClass}" style="color:${t.fg};">${text}</span>
    </td>
  </tr>
</table>`;
}

export function heading(text: string) {
  return `<h1 class="tm-ink tm-h1" style="margin:0 0 14px; font-family:${DISPLAY_FONT}; font-size:28px; line-height:34px; font-weight:800; letter-spacing:-0.6px; color:${C.ink};">${text}</h1>`;
}

export function paragraph(html: string) {
  return `<p class="tm-ink" style="margin:0 0 16px; font-family:${BODY_FONT}; font-size:16px; line-height:26px; color:${C.ink};">${html}</p>`;
}

/** Secondary copy inside the card: timings, small print. */
export function muted(html: string) {
  return `<p class="tm-text2" style="margin:16px 0 0; font-family:${BODY_FONT}; font-size:14px; line-height:22px; color:${C.text2};">${html}</p>`;
}

export function link(href: string, label: string) {
  return `<a href="${escapeHtml(href)}" class="tm-coral-text" style="color:${C.coralStrong}; font-weight:600; text-decoration:underline;">${label}</a>`;
}

export function divider() {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;"><tr><td class="tm-rule" style="border-top:1px solid ${C.hairline}; font-size:0; line-height:0;">&nbsp;</td></tr></table>`;
}

/**
 * Bulletproof CTA: a padded `<a>` in a coloured cell for everyone, VML
 * roundrect for Outlook desktop, which ignores padding on inline elements.
 */
export function button(href: string, label: string) {
  const safeHref = escapeHtml(href);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="tm-btn" style="margin:28px 0 8px;">
  <tr>
    <td align="center" style="border-radius:999px; background-color:${C.coral}; background-image:linear-gradient(90deg, #f43f5e, #f97316);">
      <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${safeHref}" style="height:52px; v-text-anchor:middle; width:280px;" arcsize="50%" stroke="f" fillcolor="${C.coral}"><w:anchorlock/><center style="color:#ffffff; font-family:Arial, sans-serif; font-size:17px; font-weight:bold;">${label}</center></v:roundrect><![endif]-->
      <!--[if !mso]><!--><a href="${safeHref}" target="_blank" style="display:inline-block; padding:15px 34px; font-family:${BODY_FONT}; font-size:17px; line-height:22px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:999px; mso-hide:all;">${label}${textSkip("&nbsp;&rarr;")}</a><!--<![endif]-->
    </td>
  </tr>
</table>`;
}

/** One label/value line. `value` must already be escaped by the caller. */
export function infoRow(label: string, value: string) {
  return `<tr>
  <td class="tm-text2" style="padding:7px 0; font-family:${BODY_FONT}; font-size:14px; line-height:20px; color:${C.text2}; vertical-align:top;">${label}</td><!--text:sep-->
  <td class="tm-ink" align="right" style="padding:7px 0 7px 16px; font-family:${BODY_FONT}; font-size:14px; line-height:20px; font-weight:600; color:${C.ink}; text-align:right; vertical-align:top;">${value}</td>
</tr>`;
}

export function infoTable(rows: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`;
}

export interface SummaryCardData {
  /** Small caps label, e.g. "Your order". */
  label?: string;
  /** The item's name, already escaped. */
  title?: string;
  /** `[label, value]` pairs; values already escaped. Falsy entries are skipped. */
  rows: Array<readonly [string, string] | false | null | undefined>;
  /** Emphasised last line, e.g. the total. */
  total?: readonly [string, string];
}

/** The tinted panel that says what this email is about at a glance. */
export function summaryCard(data: SummaryCardData) {
  const rows = data.rows.filter((r): r is readonly [string, string] => Boolean(r));
  const label = data.label
    ? `<p class="tm-text3" style="margin:0 0 6px; font-family:${BODY_FONT}; font-size:12px; line-height:16px; font-weight:700; letter-spacing:0.6px; text-transform:uppercase; color:${C.text3};">${data.label}</p>`
    : "";
  const title = data.title
    ? `<p class="tm-ink" style="margin:0 0 12px; font-family:${DISPLAY_FONT}; font-size:18px; line-height:25px; font-weight:700; color:${C.ink};">${data.title}</p>`
    : "";
  const total = data.total
    ? `<tr><td colspan="2" class="tm-rule" style="border-top:1px solid ${C.border}; padding-top:12px; font-size:0; line-height:0;">&nbsp;</td></tr>
<tr>
  <td class="tm-ink" style="font-family:${BODY_FONT}; font-size:15px; line-height:22px; font-weight:700; color:${C.ink};">${data.total[0]}</td><!--text:sep-->
  <td class="tm-ink" align="right" style="font-family:${DISPLAY_FONT}; font-size:20px; line-height:26px; font-weight:800; color:${C.ink}; text-align:right;">${data.total[1]}</td>
</tr>`
    : "";

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
  <tr>
    <td class="tm-panel" style="background-color:${C.paper}; border:1px solid ${C.border}; border-radius:14px; padding:20px 22px;">
      ${label}${title}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${rows.map(([l, v]) => infoRow(l, v)).join("")}
        ${total}
      </table>
    </td>
  </tr>
</table>`;
}

/** A tinted note that must not be skimmed past. */
export function callout(html: string, tone: Tone = "coral") {
  const t = TONES[tone];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
  <tr>
    <td class="${t.bgClass}" style="background-color:${t.bg}; border-left:4px solid ${tone === "neutral" ? C.border : t.fg}; border-radius:10px; padding:16px 18px; font-family:${BODY_FONT}; font-size:15px; line-height:24px;">
      <span class="tm-ink" style="color:${C.ink};">${html}</span>
    </td>
  </tr>
</table>`;
}

/** Someone's own words — a buyer's note — set apart from our copy. */
export function quote(text: string, attribution: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
  <tr>
    <td class="tm-panel" style="background-color:${C.paper}; border-radius:12px; padding:18px 20px; font-family:${BODY_FONT};">
      <p class="tm-ink" style="margin:0 0 8px; font-size:16px; line-height:25px; font-style:italic; color:${C.ink};">&ldquo;${text}&rdquo;</p>
      <p class="tm-text2" style="margin:0; font-size:13px; line-height:18px; font-weight:600; color:${C.text2};">${attribution}</p>
    </td>
  </tr>
</table>`;
}

/**
 * A step tracker: done steps in green, the current one in coral, the rest
 * grey. `current` is the index of the step the order is now at.
 */
export function steps(labels: readonly string[], current: number) {
  const width = Math.floor(100 / labels.length);
  const cells = labels
    .map((label, i) => {
      const done = i < current;
      const now = i === current;
      const dot = done ? C.green : now ? C.coral : C.border;
      const dotClass = done || now ? "" : " tm-dot-off";
      const textClass = now ? "tm-ink" : done ? "tm-green-text" : "tm-text3";
      const textColor = now ? C.ink : done ? C.greenInk : C.text3;
      const mark = done ? "&#10003;" : String(i + 1);
      return `<td width="${width}%" align="center" valign="top" style="padding:0 2px; font-family:${BODY_FONT};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 8px;"><tr><td ${dotClass ? `class="${dotClass.trim()}" ` : ""}width="28" height="28" align="center" style="width:28px; height:28px; border-radius:999px; background-color:${dot}; font-size:13px; line-height:28px; font-weight:700; color:${done || now ? "#ffffff" : C.text3}; text-align:center;">${textSkip(mark)}</td></tr></table>
  <span class="${textClass}" style="display:block; font-size:12px; line-height:16px; font-weight:${now ? 700 : 500}; color:${textColor};">${textSkip(label)}</span>
</td>`;
    })
    .join("");
  const summary = labels.map((l, i) => (i === current ? `[${l}]` : l)).join(" > ");
  return `<!--text:only:Progress: ${summary}-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
  <tr>${cells}</tr>
</table>`;
}

/** A one-time code, big and spaced, easy to copy. */
export function codeBox(code: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
  <tr>
    <td align="center" class="tm-tint" style="background-color:${C.tint}; border-radius:14px; padding:22px 16px;">
      <span class="tm-ink" style="font-family:${MONO_FONT}; font-size:32px; line-height:38px; font-weight:700; letter-spacing:8px; color:${C.ink};">${code}</span>
    </td>
  </tr>
</table>`;
}

/** "Button not working? Copy this link" — the raw URL for clients that mangle buttons. */
export function fallbackLink(href: string) {
  const safe = escapeHtml(href);
  return textSkip(`<p class="tm-text2" style="margin:20px 0 0; font-family:${BODY_FONT}; font-size:13px; line-height:20px; color:${C.text2};">Button not working? Paste this link into your browser:<br /><a href="${safe}" class="tm-coral-text" style="color:${C.coralStrong}; word-break:break-all;">${safe}</a></p>`);
}
