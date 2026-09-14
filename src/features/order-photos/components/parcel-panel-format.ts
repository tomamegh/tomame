import type { OrderPhotoKind } from "@/db/queries/order-photos";
import type { OrderFeedbackStatus, OrderFeedbackVerdict } from "@/db/queries/order-feedback";
import type { OrderStatus } from "@/features/orders/types";

/**
 * The rules and the wording behind the parcel panel on `/admin/orders/[id]`.
 *
 * Pure and framework-free, for the reasons `admin-transitions.ts` is: the panel
 * decides what to OFFER without a round trip, the server decides what is
 * permitted, and the sentences an operator reads can be unit tested without
 * mounting a component.
 *
 * The one number here that is not cosmetic is the upload ceiling. Both figures
 * are the route's own limits repeated so a bad selection is refused in the
 * browser instead of after a multi-megabyte upload on a warehouse connection;
 * the route keeps enforcing them either way, and it is the authority.
 */

/**
 * Statuses where a parcel exists to be photographed.
 *
 * `pending` has nothing bought yet and `cancelled` has nothing moving, so there
 * is nothing to point a camera at. Everything from `paid` onward can be, and
 * `delivered` is deliberately included: damage found at the door is exactly the
 * photograph a dispute turns on.
 */
const PHOTOGRAPHABLE: readonly OrderStatus[] = [
  "paid",
  "processing",
  "in_transit",
  "delivered",
  "completed",
];

export function mayPhotographParcel(status: OrderStatus): boolean {
  return PHOTOGRAPHABLE.includes(status);
}

/** Matches `MAX_PHOTOS_PER_UPLOAD` in the POST route. One arrival, not a camera roll. */
export const MAX_PHOTOS_PER_UPLOAD = 10;

/** Matches `MAX_UPLOAD_BYTES` in `features/media/services/image-upload.ts`. */
export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

/** The longest note the POST route will accept. */
export const MAX_CAPTION_LENGTH = 500;

/**
 * What the operator is saying the picture shows.
 *
 * `kind` is their classification rather than something derived from the order's
 * status, because a parcel can be photographed at the hub long after the order
 * was marked processing. The labels are the operator's half of the pair the
 * customer reads in `journeys/format.ts`.
 */
export interface PhotoKindChoice {
  value: OrderPhotoKind;
  label: string;
}

export const PHOTO_KIND_CHOICES: readonly PhotoKindChoice[] = [
  { value: "hub_received", label: "Arrived at our US hub" },
  { value: "packed", label: "Packed for the flight" },
  { value: "damaged", label: "Damage we found" },
  { value: "delivered", label: "At the customer's door" },
  { value: "other", label: "Something else from the warehouse" },
];

/** The kind a fresh form starts on: the arrival shot is the everyday one. */
export const DEFAULT_PHOTO_KIND: OrderPhotoKind = "hub_received";

/** A size a person can read. Whole megabytes look wrong on a 1.4MB photo. */
export function formatPhotoSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Just enough of a file to judge a selection by. Keeps this module off the DOM. */
export interface SelectedPhoto {
  name: string;
  size: number;
  type: string;
}

/**
 * Why this selection cannot be sent, in the words the operator should see.
 *
 * Null means send it. Every rule below is one the route enforces too, so the
 * only thing being saved is the upload itself and the minute it takes on a
 * warehouse connection.
 */
export function describeSelectionProblem(files: readonly SelectedPhoto[]): string | null {
  if (files.length === 0) return "Choose a photo first.";

  if (files.length > MAX_PHOTOS_PER_UPLOAD) {
    return `That is ${files.length} photos. Send ${MAX_PHOTOS_PER_UPLOAD} or fewer at a time.`;
  }

  const tooBig = files.find((file) => file.size > MAX_PHOTO_BYTES);
  if (tooBig) {
    return `${tooBig.name} is ${formatPhotoSize(tooBig.size)}. The limit is ${formatPhotoSize(
      MAX_PHOTO_BYTES,
    )} a photo.`;
  }

  // An empty file is a picker that handed back a placeholder, which happens on
  // some Android camera intents. Sending it wastes the round trip and comes
  // back as a 422 the operator cannot act on.
  const empty = files.find((file) => file.size === 0);
  if (empty) return `${empty.name} is empty. Take it again.`;

  const notAnImage = files.find((file) => file.type !== "" && !file.type.startsWith("image/"));
  if (notAnImage) return `${notAnImage.name} is not an image.`;

  return null;
}

/** "3 photos, 4.2 MB" under the picker, so nobody sends 40MB by accident. */
export function describeSelection(files: readonly SelectedPhoto[]): string {
  const bytes = files.reduce((sum, file) => sum + file.size, 0);
  const count = files.length === 1 ? "1 photo" : `${files.length} photos`;
  return `${count}, ${formatPhotoSize(bytes)}`;
}

/**
 * What is already on the order, in one line.
 *
 * The internal count is called out rather than folded into the total: an
 * operator looking at four pictures needs to know which of them the customer
 * can actually open.
 */
export function summarisePhotos(
  photos: readonly { isCustomerVisible: boolean }[],
): string {
  if (photos.length === 0) return "No photo yet";

  const hidden = photos.filter((photo) => !photo.isCustomerVisible).length;
  const total = photos.length === 1 ? "1 photo" : `${photos.length} photos`;
  if (hidden === 0) return total;
  if (hidden === photos.length) return `${total}, none shown to the customer`;
  return `${total}, ${hidden} kept internal`;
}

/**
 * Feedback still owed an answer.
 *
 * A confirmation is never counted. `looks_right` is a customer saying we bought
 * the right thing, and putting it in a "waiting on you" figure would turn the
 * best outcome the feature produces into a chore. That is the same rule
 * `queue-format.ts` keeps on the feedback queue.
 */
export function unansweredFeedback<
  T extends { verdict: OrderFeedbackVerdict; status: OrderFeedbackStatus },
>(rows: readonly T[]): T[] {
  return rows.filter(
    (row) =>
      row.verdict !== "looks_right" && (row.status === "open" || row.status === "in_review"),
  );
}

/**
 * The line under the panel's title, which changes with where the parcel is.
 *
 * Before anything has been photographed this is the only prompt an operator
 * gets, so it says what the picture is FOR rather than what the control does.
 */
export function describePhotoMoment(status: OrderStatus, hasPhotos: boolean): string {
  if (hasPhotos) {
    return "The customer sees these on their journey screen and can tell you straight away if we bought the wrong thing.";
  }
  switch (status) {
    case "paid":
    case "processing":
      return "When the parcel reaches the US hub, photograph it here. It is the first time the customer sees what was actually bought, and the last point where a mistake is cheap.";
    case "in_transit":
      return "This box is already flying. A photo is still worth taking, but a wrong item now costs a second shipment.";
    default:
      return "Photograph anything worth a record, damage at the door above all. The customer sees it on their journey screen.";
  }
}
