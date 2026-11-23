/**
 * Who an order is for, from one record (site brief, Fix 15). Pure.
 *
 * Shipments named TM-00036's customer "Benita Lamptey" (the checkout's "Deliver
 * to") while Admin Deliveries named "Mac-Dennis Lamptey" (the account holder's
 * profile). Both screens now take the name from here: the checkout snapshot's
 * recipient, which is who signs for the parcel, else the account holder. The
 * account holder is shown beside it when the two differ, and an order with no
 * name anywhere says so instead of printing "–".
 */

export interface PeopleProfile {
  first_name: string | null;
  last_name: string | null;
}

export function profileName(profile: PeopleProfile | null | undefined): string | null {
  if (!profile) return null;
  const name = [profile.first_name, profile.last_name].filter((p) => !!p?.trim()).join(" ").trim();
  return name || null;
}

export function snapshotRecipientName(snapshot: Record<string, unknown> | null | undefined): string | null {
  const v = snapshot?.recipient_name;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export interface OrderPeople {
  /** The name every screen shows: who the parcel is for. */
  name: string | null;
  /** The account holder, when it is a different person from `name`. */
  account: string | null;
  /** No name anywhere on the order: flagged, never "–". */
  missing: boolean;
}

export function orderPeople(snapshot: Record<string, unknown> | null | undefined, profile: PeopleProfile | null | undefined): OrderPeople {
  const recipient = snapshotRecipientName(snapshot);
  const holder = profileName(profile);
  const name = recipient ?? holder;
  const account = holder && name && holder.toLowerCase() !== name.toLowerCase() ? holder : null;
  return { name, account, missing: !name };
}
