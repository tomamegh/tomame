import type { AdminTone } from "@/components/layout/admin/admin-page";
import { whatsappHref } from "@/components/layout/marketing/links";
import { hostOf } from "@/features/bag/components/format";
import { formatRelativeTime } from "@/features/app-home/components/format";
import type { AssistedRequestStatus } from "@/db/queries/assisted-requests";

/**
 * How the buyer's queue is spelled.
 *
 * Pure, so the copy and the WhatsApp draft can be tested without a DOM, and so
 * neither is buried in JSX where nobody will find it to change the wording.
 */

/** The status, as a person would say it. */
export function assistedStatusLabel(status: AssistedRequestStatus): string {
  switch (status) {
    case "open":
      return "Waiting";
    case "contacted":
      return "In conversation";
    case "resolved":
      return "Sorted";
    case "cancelled":
      return "Not going ahead";
  }
}

/**
 * Tone for a status.
 *
 * Amber on `open` and nothing else, because amber means a HUMAN owes somebody an
 * action and `open` is the only state where that is unambiguously true — once a
 * buyer is in conversation the ball is often with the customer.
 */
export function assistedStatusTone(status: AssistedRequestStatus): AdminTone {
  switch (status) {
    case "open":
      return "amber";
    case "contacted":
      return "coral";
    case "resolved":
      return "green";
    case "cancelled":
      return "muted";
  }
}

/**
 * "Waiting 3 hrs" — how long this customer has been told a person is coming.
 *
 * `now` is passed in rather than read from the clock so the value is testable
 * and so two renders of the same list cannot disagree. Null on an unparseable
 * timestamp: dropping the clause beats printing "Waiting Invalid Date".
 */
export function describeAssistedWait(createdAt: string, now: Date): string | null {
  const relative = formatRelativeTime(createdAt, now);
  if (!relative) return null;
  if (relative === "just now") return "Just arrived";
  return `Waiting ${relative.replace(/ ago$/, "")}`;
}

/**
 * The draft a buyer opens on WhatsApp.
 *
 * The number is the CUSTOMER's, the one they typed on the form — never
 * `site_settings.whatsapp_number`, which is Tomame's own and would have a buyer
 * messaging themselves.
 *
 * The text is a draft, not a send: WhatsApp opens the conversation with this in
 * the box and the buyer edits it before pressing send. It names the link so the
 * customer knows which of their requests this is about — several people paste
 * more than one — and asks rather than promises, because nothing has been priced
 * at this point.
 *
 * Returns null when the number cannot be dialled, so the caller drops the button
 * rather than rendering a link that goes nowhere.
 */
export function assistedWhatsappHref(request: { phone: string; product_url: string }): string | null {
  const base = whatsappHref(request.phone);
  if (!base) return null;

  const text = `Hello, this is Tomame. You asked us to help you buy something from ${hostOf(
    request.product_url,
  )} — can I check a couple of details with you?`;
  return `${base}?text=${encodeURIComponent(text)}`;
}

/** Which transitions a buyer may make from where they are. */
export type AssistedAction = "contacted" | "resolved" | "cancelled";

export function assistedActionsFor(status: AssistedRequestStatus): AssistedAction[] {
  if (status === "open") return ["contacted", "resolved", "cancelled"];
  if (status === "contacted") return ["resolved", "cancelled"];
  // Resolved and cancelled are the end. The server would refuse anyway (the
  // transition is guarded on the status the buyer saw), but offering a button
  // that is going to 409 is a worse way to say "no".
  return [];
}

export const ASSISTED_ACTION_LABELS: Record<AssistedAction, string> = {
  contacted: "I've messaged them",
  resolved: "Sorted",
  cancelled: "Not going ahead",
};
