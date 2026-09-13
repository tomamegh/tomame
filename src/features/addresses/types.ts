/** A row of `delivery_addresses` (048). Customer-owned; every write is the server's. */
export interface DeliveryAddress {
  id: string;
  user_id: string;
  /** "Home", "Office" — the customer's own word for it. */
  label: string;
  /** Always "door" for saved addresses; pickup is a zone choice, not an address. */
  kind: "door" | "pickup";
  recipient_name: string;
  phone: string;
  line1: string;
  line2: string | null;
  /** "East Legon" */
  area: string | null;
  city: string;
  region: string | null;
  /** The `delivery_zones` row whose `fee_ghs` this address is charged at. */
  delivery_zone_id: string | null;
  /** GhanaPost GPS, e.g. GA-183-4310 */
  digital_address: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}
