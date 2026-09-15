import type { PasteAssisted } from "../services/paste-status";

/**
 * What to say about a link a person is already holding.
 *
 * The paste rows say "A buyer is on it" and stop there, which is the right
 * amount on a list whose subject is the machine. The ask panel's subject IS the
 * person, so it has to distinguish the two states that actually differ to the
 * customer: nobody has opened it yet, and somebody has and is about to message
 * them. `assisted_requests.status` carries `resolved` and `cancelled` too, but
 * neither ever reaches a screen — `listOpenAssistedRequestsByUrl` filters to the
 * open pair, because once a buyer has closed it the machine's options are back
 * on the table and the row belongs to the paste list again.
 *
 * Framework free and pure, so the copy can be tested without rendering anything.
 */

export interface AskSummary {
  /** The line the customer reads. */
  title: string;
  /** The second line, or null when the title says enough. */
  detail: string | null;
  /** Amber while it is still waiting on a human; green once one has it. */
  tone: "amber" | "green";
}

/**
 * "just now" / "4 minutes ago" / "2 hours ago" / "3 days ago".
 *
 * Returns null on an unparseable timestamp rather than "Invalid Date ago": a
 * bad row should say nothing about its age, not shout about a formatting
 * problem the customer cannot do anything with. A timestamp in the future is
 * "just now" for the same reason the paste clock floors at zero — a few seconds
 * of clock skew between a phone and the database is not worth a negative number.
 *
 * Written in words rather than the admin queue's "3 min ago" shorthand. This one
 * is read by customers.
 */
export function askedAgo(iso: string, now: Date): string | null {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;

  const minutes = Math.floor((now.getTime() - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} ${plural(minutes, "minute")} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${plural(hours, "hour")} ago`;

  const days = Math.floor(hours / 24);
  return `${days} ${plural(days, "day")} ago`;
}

/**
 * The state of one open request, in the customer's terms.
 *
 * `open` is deliberately not dressed up as progress. The queue is worked by hand
 * and a request that arrived a minute ago has almost certainly not been opened
 * yet; saying "a buyer is on it" then would be a promise about a person who has
 * not looked. `contacted` is the one that has earned that sentence.
 */
export function describeAsk(assisted: PasteAssisted, now: Date): AskSummary {
  const ago = askedAgo(assisted.requested_at, now);
  const asked = ago ? `You asked ${ago}.` : null;

  if (assisted.status === "contacted") {
    return {
      title: "A buyer is on it",
      detail: [asked, "They are messaging you on the number you gave us."].filter(Boolean).join(" "),
      tone: "green",
    };
  }

  return {
    title: "With our buyers",
    detail: [asked, "Someone picks these up by hand, so it is minutes rather than seconds."]
      .filter(Boolean)
      .join(" "),
    tone: "amber",
  };
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}
