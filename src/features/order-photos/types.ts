import type { OrderPhotoKind, OrderPhotoRow } from "@/db/queries/order-photos";

/**
 * What a screen is given for a parcel photograph (054).
 *
 * The row's `storage_path` never leaves the server: the bucket is private and
 * the bytes have exactly one door, `/api/order-photos/<id>`, which re-checks per
 * request that the caller owns the order. So the view model carries a URL that
 * is an ENDPOINT rather than a location, and knowing it is not the same as
 * being able to read it.
 */
export interface OrderPhotoView {
  id: string;
  orderId: string;
  kind: OrderPhotoKind;
  /** The admin's own words next to the picture. Null when they wrote none. */
  caption: string | null;
  /** Same-origin path that streams the bytes. Never a storage URL. */
  url: string;
  /** The re-encoded dimensions, so a layout can reserve the right box. */
  width: number;
  height: number;
  byteSize: number;
  /** When the photograph was taken, ISO. */
  takenAt: string;
  /**
   * False for an internal-only picture. A customer never receives one of these
   * — the filtering happens server-side — but the admin console shows the flag.
   */
  isCustomerVisible: boolean;
}

/** The one place a photo URL is constructed. */
export function orderPhotoUrl(photoId: string): string {
  return `/api/order-photos/${photoId}`;
}

export function toOrderPhotoView(row: OrderPhotoRow): OrderPhotoView {
  return {
    id: row.id,
    orderId: row.order_id,
    kind: row.kind,
    caption: row.caption,
    url: orderPhotoUrl(row.id),
    width: row.width,
    height: row.height,
    byteSize: row.byte_size,
    takenAt: row.taken_at,
    isCustomerVisible: row.is_customer_visible,
  };
}
