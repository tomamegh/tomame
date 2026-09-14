import { emailLayout, heading, paragraph, muted, divider, button, infoRow, infoTable } from "./layout";

/**
 * "We've got your parcel, and here's what it looks like" (migration 054).
 *
 * WHY THIS EMAIL EXISTS AND WHY IT IS URGENT-SHAPED. This is the first and only
 * moment a customer sees what was actually BOUGHT rather than what they asked
 * for, and it lands while the parcel is still at a US hub — which is the last
 * point at which a wrong colour or a wrong model is cheap to fix. Once it flies,
 * the same mistake costs an international return. So the email's job is not to
 * delight; it is to get someone to LOOK, now, and say if it is wrong.
 *
 * THE PHOTO IS NOT EMBEDDED, and that is deliberate. The bucket is private and
 * the bytes are served by a route that re-checks ownership on every request, so
 * a photo in an email body would either have to be a public URL (a parcel photo
 * on the open internet, defeating the point) or an attachment (which follows the
 * message anywhere it is forwarded, and cannot be withdrawn). The customer
 * follows a link into their own signed-in journey instead, where the same
 * ownership check that guards the image guards the page.
 *
 * NO NUMBERS. Nothing here restates a price. The customer has already paid; a
 * money figure in this message invites them to re-litigate the quote when the
 * question actually being asked is "is this the right thing?".
 */
export interface ParcelPhotoEmailData {
  productName: string;
  /** `TM-00001` — the number a customer can read aloud on WhatsApp. */
  orderNo: string;
  /** Deep link into the customer's own journey detail screen. */
  journeyUrl: string;
  /** Where the parcel was photographed, e.g. "New York". Null when unrecorded. */
  location: string | null;
  /** Received weight in pounds, when the operator recorded one. */
  weightLbs: number | null;
  /** How many pictures were added, so the copy does not promise one and show four. */
  photoCount: number;
}

export function parcelPhotoTemplate(data: ParcelPhotoEmailData) {
  const many = data.photoCount > 1;
  const noun = many ? `${data.photoCount} photos` : "a photo";

  return {
    subject: `Your parcel reached our hub: ${data.productName}`,
    html: emailLayout(`
      ${heading("Your parcel is with us")}
      ${paragraph(
        `<strong>${data.productName}</strong> has arrived at our US hub, and we took ${noun} of it before it goes any further.`,
      )}
      ${divider()}
      ${infoTable(`
        ${infoRow("Order", data.orderNo)}
        ${infoRow("Item", data.productName)}
        ${data.location ? infoRow("Where", data.location) : ""}
        ${data.weightLbs !== null ? infoRow("Received weight", `${data.weightLbs} lb`) : ""}
      `)}
      ${divider()}
      ${button(data.journeyUrl, many ? "See the photos" : "See the photo")}
      ${paragraph(
        `<strong>Please take a look now.</strong> If it is not what you ordered (wrong colour, wrong model, damaged in the box), tell us from that same screen and we will sort it while your parcel is still on the ground. Once it flies, putting it right costs a return from Ghana.`,
      )}
      ${paragraph(`If it looks right, you can say so too. It takes a second, and it tells us to send it on.`)}
      ${muted(
        `We keep parcel photos private to your account: the picture opens only for you, on a page you have to be signed in to reach, which is why it is a link here rather than an image. You are getting this because it is your order. Email notifications can be switched off in your Tomame account. You will still see this in the app.`,
      )}
    `),
  };
}
