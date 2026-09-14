import type { AdminTone } from "@/components/layout/admin";
import type { PlatformRoles } from "@/features/auth/types";

/**
 * Display helpers for the users admin.
 *
 * The one that earns its keep is `roleGrantSummary`. A role change is the most
 * consequential write in the product — this session closed a live privilege
 * escalation on production where any signed-in customer could PATCH
 * `profiles.role` straight at PostgREST and make themselves an admin (fixed by
 * the column-level GRANT in migration 051). The privilege is now correctly
 * enforced, which makes the remaining risk a human one: an admin clicking
 * "Admin" in a dropdown without a clear statement of what it hands over. That
 * statement lives here, in one place, so the confirmation dialog and the detail
 * screen cannot describe it differently.
 *
 * Pure functions, British English.
 */

export function userDisplayName(
  profile: { first_name?: string | null; last_name?: string | null } | null,
  email: string | null | undefined,
): string {
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  if (name.length > 0) return name;
  // The email is the only other thing a person recognises. Never "Unknown".
  return email ?? "Account with no name";
}

/** Initials for the avatar, or a single letter from the email. */
export function userInitials(
  profile: { first_name?: string | null; last_name?: string | null } | null,
  email: string | null | undefined,
): string {
  const first = profile?.first_name?.trim()?.[0];
  const last = profile?.last_name?.trim()?.[0];
  if (first && last) return `${first}${last}`.toUpperCase();
  if (first) return first.toUpperCase();
  const letter = email?.trim()?.[0];
  return (letter ?? "?").toUpperCase();
}

export function roleBadge(role: PlatformRoles): { label: string; tone: AdminTone } {
  switch (role) {
    case "admin":
      return { label: "Admin", tone: "coral" };
    case "system":
      return { label: "System", tone: "neutral" };
    default:
      return { label: "Customer", tone: "muted" };
  }
}

/**
 * What each role actually grants, in the words the confirmation dialog uses.
 *
 * Written from the gate rather than from intent: `src/proxy.ts` admits the
 * `admin` role to the whole of `/admin` and the whole of `/api/admin`, so the
 * grant is everything behind both, and saying anything narrower would be a
 * comforting lie.
 */
export function roleGrantSummary(role: PlatformRoles): string {
  switch (role) {
    case "admin":
      return "Full access to every admin screen and every admin endpoint: orders, payments, pricing, customer records and the ability to change anyone's role, including removing yours.";
    case "system":
      return "A machine account. It is not a person and should not be assigned by hand.";
    default:
      return "The storefront only: their own bag, orders, addresses and watches. No admin screen and no admin endpoint.";
  }
}

/**
 * The sentence shown before a role change is committed.
 *
 * `self` is called out separately because demoting yourself is the one change
 * that locks the person making it out of the screen they are standing on, and a
 * generic "are you sure" does not convey that.
 */
export function roleChangeWarning(
  from: PlatformRoles,
  to: PlatformRoles,
  isSelf: boolean,
): string {
  if (isSelf && to !== "admin") {
    return "You are removing your own admin access. You will lose this screen as soon as it saves, and another admin will have to give it back.";
  }
  if (to === "admin") {
    return `This account becomes an administrator. ${roleGrantSummary("admin")}`;
  }
  if (from === "admin") {
    return "This account loses all admin access immediately. Any admin page they have open stops working on the next request.";
  }
  return roleGrantSummary(to);
}

/**
 * "Joined 3 Sep 2026". Formatted in UTC, as every other date in the admin is,
 * so two screens cannot disagree about which day an account was created.
 */
const joinedFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatJoined(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return joinedFormatter.format(date);
}

/**
 * How a customer has asked to be reached, as one readable line.
 *
 * "Nothing" is a real and important answer: a customer with email off and no
 * WhatsApp opt-in has silently turned off every channel the platform has, and
 * an order update for them goes nowhere. It must not be rendered as an empty
 * string.
 */
export function contactChannelsLabel(prefs: {
  notify_email: boolean;
  whatsapp_opt_in: boolean;
  phone: string | null;
}): { label: string; tone: AdminTone } {
  const channels: string[] = [];
  if (prefs.notify_email) channels.push("Email");
  // An opt-in with no number is not a channel — migration 051 makes `phone`
  // nullable and unverified, and WhatsApp needs one.
  if (prefs.whatsapp_opt_in && prefs.phone) channels.push("WhatsApp");

  if (channels.length === 0) {
    return {
      label: prefs.whatsapp_opt_in
        ? "No reachable channel: WhatsApp is on but no number is saved"
        : "No reachable channel",
      tone: "coral",
    };
  }
  return { label: channels.join(" and "), tone: "green" };
}
