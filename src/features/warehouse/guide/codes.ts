/**
 * How the Scan screen reads what it is given (081 guide), for the "try a code"
 * box. A client-safe copy of `normaliseCode` in the warehouse service, which is
 * server-only; `__tests__/codes.test.ts` runs both over the same inputs so the
 * two cannot drift.
 */

export type ReadCode =
  | { kind: "package"; code: string }
  | { kind: "order"; code: string }
  | { kind: "unknown"; code: string }
  | { kind: "empty" };

export function readCode(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;
  const fromUrl = value.match(/\/warehouse\/p\/([^/?#\s]+)/i);
  if (fromUrl?.[1]) value = decodeURIComponent(fromUrl[1]);
  value = value.toUpperCase().replace(/\s+/g, "");
  const pkg = value.match(/^PKG-?(\d{3,})$/);
  if (pkg) return `PKG-${pkg[1]}`;
  const order = value.match(/^TM-?(\d{1,})$/);
  if (order?.[1]) return `TM-${order[1].padStart(5, "0")}`;
  if (/^\d{5,}$/.test(value)) return `PKG-${value}`;
  return value;
}

export function explainCode(raw: string): ReadCode {
  const code = readCode(raw);
  if (!code) return { kind: "empty" };
  if (code.startsWith("PKG-")) return { kind: "package", code };
  if (code.startsWith("TM-")) return { kind: "order", code };
  return { kind: "unknown", code };
}
