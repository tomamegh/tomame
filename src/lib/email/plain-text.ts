/**
 * The plain-text alternative of an email, derived from its HTML.
 *
 * Derived rather than written twice so the two versions cannot drift: every
 * template is built from the blocks in `templates/layout.ts`, and those blocks
 * leave three markers for this function:
 *
 *   <!--text:skip-->…<!--/text:skip-->  dropped (preheader, decorative glyphs,
 *                                       the "button not working?" repeat)
 *   <!--text:sep-->                     ": " between a row's label and value
 *   <!--text:only:…-->                  a line that exists only in plain text
 *
 * Everything else is ordinary HTML-to-text: links become "label: url", block
 * ends become line breaks, tags go, entities decode.
 */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  nbsp: " ",
  middot: "·",
  mdash: "—",
  ndash: "–",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  rarr: "→",
  copy: "©",
  hellip: "…",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

export function htmlToText(html: string): string {
  let s = html;

  s = s.replace(/<head[\s\S]*?<\/head>/gi, "");
  s = s.replace(/<!--text:skip-->[\s\S]*?<!--\/text:skip-->/g, "");
  s = s.replace(/<!--text:only:([\s\S]*?)-->/g, "\n$1\n");
  s = s.replace(/<!--text:sep-->/g, "@@TEXT_SEP@@");
  // Conditional comments (Outlook VML) and any other comment.
  s = s.replace(/<!--\[if mso\]>[\s\S]*?<!\[endif\]-->/g, "");
  s = s.replace(/<!--\[if !mso\]><!-->|<!--<!\[endif\]-->/g, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");

  s = s.replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, inner: string) => {
    const url = decodeEntities(href);
    const label = decodeEntities(stripTags(inner)).replace(/\s+/g, " ").trim();
    if (url.startsWith("mailto:")) return label || url.slice(7);
    if (!label || label === url || label === url.replace(/^https?:\/\//, "").replace(/\/$/, "")) return url;
    return `${label}: ${url}`;
  });

  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|h[1-6]|tr|li|div|table)>/gi, "\n");
  s = s.replace(/<h1\b[^>]*>/gi, "\n");
  s = stripTags(s);

  s = s.replace(/[ \t\r\f\v]*\n[ \t\r\f\v]*/g, "\n");
  s = s.replace(/[ \t\r\f\v]+/g, " ");
  s = s.replace(/\s*@@TEXT_SEP@@\s*/g, ": ");
  s = decodeEntities(s);
  s = s.replace(/[ \u00a0]+/g, " ");
  s = s.replace(/ *\n */g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");

  return s.trim();
}
