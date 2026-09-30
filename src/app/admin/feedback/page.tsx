import { redirect } from "next/navigation";

/**
 * Parcel feedback moved into the warehouse (081): an objection is about a box
 * on the bench, so it is worked where the box is. Kept as a redirect so old
 * bookmarks and emailed links still land somewhere.
 */
export default function AdminFeedbackRedirect() {
  redirect("/warehouse/issues");
}
