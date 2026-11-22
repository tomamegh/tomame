/**
 * Mobile Money at Pay (Seamless Roadmap, Initiative 1): the pure rules shared by
 * the pay rail and the payment service. No server imports, so both sides read
 * one definition of a network prefix and one shape for the prompt's state.
 */

export type MomoProvider = "mtn" | "vod" | "atl";

/**
 * Ghana's network prefixes (the digits after the trunk 0). A number keeps its
 * prefix when it is ported to another network, so this is a GUESS used only to
 * pre-select the network: the customer can always change it, and Paystack
 * charges the network they picked.
 */
const PREFIXES: ReadonlyArray<readonly [MomoProvider, readonly string[]]> = [
  ["mtn", ["24", "25", "53", "54", "55", "59"]],
  ["vod", ["20", "50"]],
  ["atl", ["26", "27", "56", "57"]],
];

/** The likely network for an E.164 Ghana number (`+233XXXXXXXXX`), or null. */
export function inferMomoProvider(e164: string | null | undefined): MomoProvider | null {
  const m = e164 ? /^\+233(\d{2})\d{7}$/.exec(e164) : null;
  const prefix = m?.[1];
  if (!prefix) return null;
  for (const [provider, prefixes] of PREFIXES) {
    if (prefixes.includes(prefix)) return provider;
  }
  return null;
}

/** `+233551234987` → `0551234987`, the form Paystack's MoMo charge takes. */
export function toLocalGhanaPhone(e164: string): string {
  return e164.startsWith("+233") ? `0${e164.slice(4)}` : e164;
}

/** `055 123 4987`, for a number the customer typed and will recognise. */
export function formatLocalGhanaPhone(e164: string): string {
  const local = toLocalGhanaPhone(e164);
  const m = /^(\d{3})(\d{3})(\d{4})$/.exec(local);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : local;
}

/** What the pay rail starts from: the saved MoMo number, else the account phone. */
export interface MomoPrefill {
  /** E.164, or null when the account has no usable Ghana number. */
  phone: string | null;
  provider: MomoProvider | null;
  /** True when this is the number the customer asked us to remember. */
  saved: boolean;
}

/**
 * Where a MoMo payment stands, as the browser is told it.
 *
 * - `approve`: the prompt is on the phone; keep asking until it settles.
 * - `otp`: the network texted a code that must be entered first.
 * - `paid`: settled; go to `redirectUrl` (the same page Paystack's callback uses).
 * - `failed`: nothing was charged; `message` says why, and Pay can be tried again.
 */
export type MomoPaymentState =
  | { state: "approve"; reference: string; message: string }
  | { state: "otp"; reference: string; message: string }
  | { state: "paid"; reference: string; redirectUrl: string }
  | { state: "failed"; reference: string; message: string };
