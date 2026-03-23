const BRAND_COLOR = "#10b981";
const BRAND_DARK = "#059669";

export function emailLayout(content: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Tomame</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f5; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, ${BRAND_COLOR}, ${BRAND_DARK}); padding:28px 32px; text-align:center;">
              <h1 style="margin:0; font-size:26px; font-weight:700; color:#ffffff; letter-spacing:-0.5px;">Tomame</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px; background-color:#fafafa; border-top:1px solid #e4e4e7; text-align:center;">
              <p style="margin:0; font-size:13px; color:#a1a1aa; line-height:1.5;">
                &copy; ${new Date().getFullYear()} Tomame &middot; Accra, Ghana<br />
                Your international shopping concierge
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function button(href: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;">
  <tr>
    <td style="border-radius:8px; background-color:${BRAND_COLOR};">
      <a href="${href}" target="_blank" style="display:inline-block; padding:14px 32px; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:8px;">
        ${label}
      </a>
    </td>
  </tr>
</table>`;
}

export function heading(text: string) {
  return `<h2 style="margin:0 0 16px; font-size:22px; font-weight:700; color:#18181b; letter-spacing:-0.3px;">${text}</h2>`;
}

export function paragraph(text: string) {
  return `<p style="margin:0 0 14px; font-size:15px; line-height:1.6; color:#3f3f46;">${text}</p>`;
}

export function muted(text: string) {
  return `<p style="margin:16px 0 0; font-size:13px; color:#a1a1aa; line-height:1.5;">${text}</p>`;
}

export function divider() {
  return `<hr style="margin:24px 0; border:none; border-top:1px solid #e4e4e7;" />`;
}

export function infoRow(label: string, value: string) {
  return `<tr>
  <td style="padding:8px 0; font-size:14px; color:#71717a; width:140px;">${label}</td>
  <td style="padding:8px 0; font-size:14px; font-weight:600; color:#18181b;">${value}</td>
</tr>`;
}

export function infoTable(rows: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0;">
  ${rows}
</table>`;
}
