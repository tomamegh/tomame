import type { AssistedRequestStatus } from "@/db/queries/assisted-requests";

/**
 * What the customer is told after asking for help.
 *
 * A deliberate subset of the row: the phone number they just typed, the staff
 * columns and the owner ids are not things to hand back to the browser.
 */
export interface AssistedRequest {
  id: string;
  product_url: string;
  description: string;
  status: AssistedRequestStatus;
  created_at: string;
  /**
   * `wa.me` link from `site_settings.whatsapp_number`, so the customer can open
   * the conversation themselves instead of waiting. Null when no number is set —
   * the request is still recorded and the buyer still sees it.
   */
  whatsapp_href: string | null;
}
