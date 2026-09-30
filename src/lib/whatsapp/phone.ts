/**
 * A phone number as Meta's Cloud API wants it: E.164 digits, no '+'.
 *
 * `profiles.phone` is what the customer typed (051: unverified), so this takes
 * every way a Ghanaian writes a number — `024 412 3456`, `0244123456`,
 * `+233 24 412 3456`, `233244123456`, `00233…`, and the slip `+233 0244…` —
 * plus an international number written with `+` or `00`. Null when it cannot be
 * a real number; the caller then skips the channel rather than sending to a
 * guess.
 */
export function normaliseWhatsAppPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const compact = raw.trim().replace(/[\s\-().]/g, "");
  if (!compact) return null;

  // Ghana national form: trunk 0 + nine digits.
  if (/^0[1-9]\d{8}$/.test(compact)) return `233${compact.slice(1)}`;

  let digits: string;
  if (compact.startsWith("+")) digits = compact.slice(1);
  else if (compact.startsWith("00")) digits = compact.slice(2);
  else if (compact.startsWith("233")) digits = compact;
  else return null;

  if (!/^\d+$/.test(digits)) return null;

  if (digits.startsWith("233")) {
    let national = digits.slice(3);
    // The kept-trunk slip: +233 0244123456.
    if (national.length === 10 && national.startsWith("0")) national = national.slice(1);
    return /^[1-9]\d{8}$/.test(national) ? `233${national}` : null;
  }

  // Any other country: E.164 allows up to 15 digits and a country code never starts with 0.
  return /^[1-9]\d{9,14}$/.test(digits) ? digits : null;
}

