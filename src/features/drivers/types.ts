import type { WarehouseRecipient } from "@/features/warehouse/types";

/**
 * What the driver app (102) sends to the browser.
 *
 * THE LEAK BOUNDARY, like `features/warehouse/types.ts`: what a driver needs at
 * a door and nothing else. The recipient's name, phone and address, the parcels
 * by name and picture. No price, no payment, no email, and NEVER the delivery
 * code: the customer reads that out, the driver types it.
 */

export interface DriverParcel {
  order_id: string;
  order_no: string;
  title: string;
  image_url: string | null;
  quantity: number;
  special_instructions: string | null;
}

/** One stop: everything going to one customer, confirmed with one code. */
export interface DriverDrop {
  /** Opaque; groups the stop. */
  key: string;
  recipient: WarehouseRecipient;
  parcels: DriverParcel[];
  /** Hand-over photos taken since the driver was given these parcels. */
  photo_count: number;
  /** Too many wrong codes: staff must confirm it now. */
  locked: boolean;
  assigned_at: string | null;
  /** Shown to staff, who see every driver's stops. */
  driver_name: string | null;
}

export interface DriverBoard {
  drops: DriverDrop[];
  /** What this driver delivered today. */
  done_today: Array<{ order_id: string; order_no: string; title: string; recipient_name: string | null }>;
  /** Staff looking at every driver, rather than a driver at their own list. */
  is_staff: boolean;
}
