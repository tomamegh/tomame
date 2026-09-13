import type { AdminTone } from "@/components/layout/admin/admin-page";
import { formatRelativeTime } from "@/features/app-home/components/format";
import type { ContactMessageStatus } from "@/db/queries/contact-messages";

/**
 * How the contact queue is spelled.
 *
 * Pure, so the mail draft in particular can be tested: it is the only route back
 * to a sender who is almost always signed out, and a malformed `mailto:` fails
 * silently in the browser.
 */

export function contactStatusLabel(status: ContactMessageStatus): string {
  switch (status) {
    case "open":
      return "Unanswered";
    case "answered":
      return "Answered";
    case "closed":
      return "Closed";
  }
}

/** Amber on `open` alone: that is the state where somebody is owed a reply. */
export function contactStatusTone(status: ContactMessageStatus): AdminTone {
  switch (status) {
    case "open":
      return "amber";
    case "answered":
      return "green";
    case "closed":
      return "muted";
  }
}

/**
 * "Waiting 3 hrs" — against the promise on the form, which says a few hours.
 *
 * `now` is passed in so the value is testable and two renders cannot disagree.
 */
export function describeContactWait(createdAt: string, now: Date): string | null {
  const relative = formatRelativeTime(createdAt, now);
  if (!relative) return null;
  if (relative === "just now") return "Just arrived";
  return `Waiting ${relative.replace(/ ago$/, "")}`;
}

/**
 * The reply draft.
 *
 * The sender's email is the only way back to them — they are usually signed out,
 * and there is no thread in the product — so this has to open the mail client
 * with the subject already threaded and their message quoted underneath. Quoting
 * it matters: a reply that arrives with no context reads like spam to somebody
 * who wrote three days ago.
 *
 * Every part is URL-encoded. A subject with an ampersand in it would otherwise
 * truncate the draft at that character, and the admin would never know.
 */
export function contactReplyHref(message: {
  email: string;
  name: string;
  subject: string;
  message: string;
}): string | null {
  const to = message.email.trim();
  if (!to.includes("@")) return null;

  const subject = message.subject.trim();
  const threaded = /^re:/i.test(subject) ? subject : `Re: ${subject}`;
  const quoted = message.message
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  const body = `Hello ${firstName(message.name)},\n\nThank you for writing to Tomame.\n\n\n\n${quoted}`;

  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(threaded)}&body=${encodeURIComponent(body)}`;
}

/** "Kwame" from "Kwame Mensah" — a greeting, not a database field. */
function firstName(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first && first.length > 0 ? first : "there";
}

/** Which transitions an admin may make from where they are. */
export type ContactAction = "answered" | "closed";

export function contactActionsFor(status: ContactMessageStatus): ContactAction[] {
  if (status === "open") return ["answered", "closed"];
  if (status === "answered") return ["closed"];
  return [];
}

export const CONTACT_ACTION_LABELS: Record<ContactAction, string> = {
  answered: "I've replied",
  closed: "Close",
};
