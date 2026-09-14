import type { AdminTone } from "@/components/layout/admin/admin-page";
import { formatRelativeTime } from "@/features/app-home/components/format";
import type {
  OrderFeedbackStatus,
  OrderFeedbackVerdict,
} from "@/db/queries/order-feedback";

/**
 * How the parcel-feedback queue is spelled.
 *
 * Pure — no DOM, no `use client` — so the wording can be tested and so a class
 * name or label shared with the server page cannot drag a client boundary along
 * with it. The two older queues (`features/assisted`, `features/contact`) keep
 * their copy the same way, and for the same reason: a label buried in JSX is a
 * label nobody finds when it needs changing.
 *
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE. `looks_right` is not a complaint.
 * It is a customer looking at a photograph of their own parcel and saying we
 * bought the right thing — the single most useful signal the feature produces —
 * and every function here takes the verdict alongside the status so that a
 * confirmation never borrows a complaint's words, a complaint's colour or a
 * complaint's place in the list.
 */

/** Is this a customer saying yes, rather than a customer with a problem? */
export function isFeedbackConfirmation(verdict: OrderFeedbackVerdict): boolean {
  return verdict === "looks_right";
}

/** The verdict, as a person would say it. */
export function feedbackVerdictLabel(verdict: OrderFeedbackVerdict): string {
  switch (verdict) {
    case "looks_right":
      return "Looks right";
    case "wrong_item":
      return "Wrong item";
    case "wrong_variant":
      return "Wrong size or colour";
    case "damaged":
      return "Damaged";
    case "other":
      return "Something else";
  }
}

/**
 * Tone for a verdict.
 *
 * Green on `looks_right` alone, and green means settled everywhere else in this
 * product — an admin scanning the column sees at a glance which rows are good
 * news. `damaged` gets coral because it is the one verdict where the parcel may
 * genuinely have to stop; the other two complaints are amber, which in the admin
 * means a human still owes somebody an action.
 */
export function feedbackVerdictTone(verdict: OrderFeedbackVerdict): AdminTone {
  switch (verdict) {
    case "looks_right":
      return "green";
    case "damaged":
      return "coral";
    case "wrong_item":
    case "wrong_variant":
      return "amber";
    case "other":
      return "neutral";
  }
}

/**
 * The status, as a person would say it — and it is not the same sentence for a
 * confirmation as for a complaint.
 *
 * An open complaint is "Waiting", because somebody is. An open confirmation is
 * "Confirmed": nobody is waiting on it, and labelling it "Waiting" would put a
 * customer's thank-you in the same column as a wrong item.
 */
export function feedbackStatusLabel(
  status: OrderFeedbackStatus,
  verdict: OrderFeedbackVerdict,
): string {
  if (isFeedbackConfirmation(verdict)) {
    return status === "open" || status === "in_review" ? "Confirmed" : "Filed";
  }
  switch (status) {
    case "open":
      return "Waiting";
    case "in_review":
      return "Being looked at";
    case "resolved":
      return "Sorted";
    case "dismissed":
      return "Nothing in it";
  }
}

/**
 * Tone for a status.
 *
 * Amber is the load-bearing one and means a HUMAN owes somebody an action, so a
 * confirmation never gets it in any state — the whole row is good news.
 */
export function feedbackStatusTone(
  status: OrderFeedbackStatus,
  verdict: OrderFeedbackVerdict,
): AdminTone {
  if (isFeedbackConfirmation(verdict)) {
    return status === "dismissed" ? "muted" : "green";
  }
  switch (status) {
    case "open":
      return "amber";
    case "in_review":
      return "coral";
    case "resolved":
      return "green";
    case "dismissed":
      return "muted";
  }
}

/**
 * "Waiting 3 hrs" for a complaint, "Said 3 hrs ago" for a confirmation.
 *
 * The difference is the point: a complaint has a clock running on it — the box
 * is at a US hub and every hour is an hour closer to it being in the air, where
 * a mistake stops being cheap — and a confirmation has no clock at all.
 *
 * `now` is passed in rather than read from the clock so the value is testable
 * and two renders of the same list cannot disagree. Null on an unparseable
 * timestamp: dropping the clause beats printing "Waiting Invalid Date".
 */
export function describeFeedbackAge(
  createdAt: string,
  now: Date,
  verdict: OrderFeedbackVerdict,
): string | null {
  const relative = formatRelativeTime(createdAt, now);
  if (!relative) return null;

  if (isFeedbackConfirmation(verdict)) {
    return relative === "just now" ? "Just now" : `Said ${relative}`;
  }
  if (relative === "just now") return "Just arrived";
  return `Waiting ${relative.replace(/ ago$/, "")}`;
}

/**
 * The same age, as a CLAUSE for the card's blurb rather than a chip.
 *
 * `describeFeedbackAge` returns badge text — "Just arrived", "Waiting 2 hrs" —
 * which reads correctly in a chip and ungrammatically in a sentence: splicing it
 * into "The one at the top has been …" produced "has been just arrived". Prose
 * and labels are different shapes, so they get different functions rather than
 * one that is nearly right in both places.
 *
 * Null on an unparseable timestamp, so the caller drops the clause entirely.
 */
export function describeOldestWait(createdAt: string, now: Date): string | null {
  const relative = formatRelativeTime(createdAt, now);
  if (!relative) return null;
  if (relative === "just now") return "The one at the top has only just come in";
  return `The one at the top has been waiting ${relative.replace(/ ago$/, "")}`;
}

/**
 * Complaints first, confirmations after — and within each, the order the server
 * gave them, which is oldest first.
 *
 * This is a PARTITION, not a re-sort: nothing moves relative to its own kind, so
 * the oldest unanswered objection is still the first thing on the screen. The
 * split exists because the two halves are read differently. A confirmation
 * interleaved among complaints reads as one more thing to work, when in fact it
 * is the outcome the feature is for.
 */
export function partitionFeedback<T extends { verdict: OrderFeedbackVerdict }>(
  rows: readonly T[],
): { complaints: T[]; confirmations: T[] } {
  const complaints: T[] = [];
  const confirmations: T[] = [];
  for (const row of rows) {
    (isFeedbackConfirmation(row.verdict) ? confirmations : complaints).push(row);
  }
  return { complaints, confirmations };
}

// ── Actions ──────────────────────────────────────────────────────────────────

/** The transitions the PATCH route accepts. `open` is where a row starts, never where it goes. */
export type FeedbackAction = "in_review" | "resolved" | "dismissed";

/**
 * Which transitions an admin may make from where they are.
 *
 * A confirmation is offered ONE button and it is not "resolve" — there is
 * nothing to resolve. It still needs clearing, because an open row keeps the
 * sidebar badge burning, so filing it is the single action. Dismissing is never
 * offered for one: "nothing in it" is a judgement about a complaint.
 *
 * Resolved and dismissed are the end. The server would refuse anyway — the
 * transition is guarded on the status the admin saw — but offering a button that
 * is going to 409 is a worse way to say "no".
 */
export function feedbackActionsFor(
  status: OrderFeedbackStatus,
  verdict: OrderFeedbackVerdict,
): FeedbackAction[] {
  if (status === "resolved" || status === "dismissed") return [];
  if (isFeedbackConfirmation(verdict)) return ["resolved"];
  if (status === "open") return ["in_review", "resolved", "dismissed"];
  return ["resolved", "dismissed"];
}

/**
 * What the button says. Verdict-aware for the same reason the status is:
 * "Sorted" on a thank-you implies there was a problem to sort.
 */
export function feedbackActionLabel(
  action: FeedbackAction,
  verdict: OrderFeedbackVerdict,
): string {
  if (isFeedbackConfirmation(verdict)) return "Noted — file it";
  switch (action) {
    case "in_review":
      return "I'm on it";
    case "resolved":
      return "Sorted";
    case "dismissed":
      return "Nothing in it";
  }
}

/**
 * May this row offer to stop the parcel?
 *
 * Only a live complaint. Kelvin's decision is that feedback never pauses
 * anything on its own and an admin decides per case — so the hold lives on the
 * row as a deliberate second action. It is never offered on a confirmation: a
 * customer saying "that is my parcel" must not be one mis-click away from
 * having their parcel stopped.
 */
export function canOfferHold(
  status: OrderFeedbackStatus,
  verdict: OrderFeedbackVerdict,
): boolean {
  return !isFeedbackConfirmation(verdict) && (status === "open" || status === "in_review");
}

// ── The hold's own 409 ───────────────────────────────────────────────────────

const ALREADY_HELD = /^This order is already on hold:\s*/i;

/**
 * Pull the standing reason out of the hold endpoint's 409.
 *
 * `POST /api/admin/orders/:id/hold` answers "This order is already on hold: X"
 * when somebody got there first, and X is the only way this screen ever learns
 * why — the feedback row carries no hold state. Null when the message is some
 * other 409 ("Someone else just put this order on hold. Refresh.") or when the
 * server itself had no reason to give, so the caller shows the sentence it was
 * handed rather than inventing one.
 */
export function extractHoldReason(message: string): string | null {
  if (!ALREADY_HELD.test(message)) return null;
  const reason = message.replace(ALREADY_HELD, "").trim();
  if (!reason || reason === "no reason recorded") return null;
  return reason;
}

/** A uuid is unreadable; the first block of one is how ops actually say it aloud. */
export function shortOrderRef(orderId: string): string {
  return orderId.slice(0, 8);
}
