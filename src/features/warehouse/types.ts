/**
 * What the packaging platform (081) sends to the browser.
 *
 * THE LEAK BOUNDARY. A warehouse operator is not an admin, so every type here is
 * a deliberate subset: an item's name, picture, weight and store; the
 * recipient's name, phone and where it is going. There is no price, no payment,
 * no email address and no pricing breakdown on any of them — the service reads
 * `orders.pricing` for its weight and drops the rest. Adding a field here is
 * adding it to what a hub contractor can see.
 */

export type PackageStatus = "packing" | "sealed" | "shipped";
export type PackageService = "air" | "sea";

/**
 * Where an item is on the bench.
 *  - awaiting:  paid for, not yet logged in at the hub.
 *  - received:  logged in (a `hub_received` event exists), not in a package.
 *  - packed:    in a package that has not left.
 *  - shipped:   in a package that has left.
 */
export type ItemStage = "awaiting" | "received" | "packed" | "shipped";

export interface WarehouseRecipient {
  name: string | null;
  phone: string | null;
  /** Door delivery or a pickup point — the label says which. */
  kind: "door" | "pickup" | null;
  line1: string | null;
  line2: string | null;
  area: string | null;
  city: string | null;
  region: string | null;
  digital_address: string | null;
  zone_name: string | null;
}

export interface WarehouseItemPackageRef {
  id: string;
  reference: string;
  status: PackageStatus;
}

export interface WarehouseItem {
  order_id: string;
  order_no: string;
  title: string;
  image_url: string | null;
  store: string | null;
  quantity: number;
  /** Per unit, from the listing or the freight breakdown. */
  listed_weight_lbs: number | null;
  order_status: string;
  stage: ItemStage;
  held: { reason: string } | null;
  /** A customer has objected to the photo and nobody has closed it. */
  has_open_issue: boolean;
  received: { at: string; weight_lbs: number | null; location: string | null } | null;
  photo_ids: string[];
  photo_count: number;
  package: WarehouseItemPackageRef | null;
  box: { id: string; label: string | null; departs_at: string | null } | null;
  /** Groups items that go to the same person. Opaque; not shown. */
  customer_key: string;
  recipient: WarehouseRecipient;
  special_instructions: string | null;
  created_at: string;
}

export interface WarehousePackageLine {
  id: string;
  quantity: number;
  /** A line typed in by hand — something that came in outside the order system. */
  description: string | null;
  item: WarehouseItem | null;
  created_at: string;
}

export interface WarehousePackage {
  id: string;
  reference: string;
  package_no: number;
  status: PackageStatus;
  service: PackageService;
  origin: string;
  destination: string;
  weight_lbs: number | null;
  /** Sum of the items' listed weights — shown when nobody has weighed the box. */
  estimated_weight_lbs: number | null;
  length_in: number | null;
  width_in: number | null;
  height_in: number | null;
  carrier: string | null;
  tracking_number: string | null;
  fragile: boolean;
  this_way_up: boolean;
  keep_dry: boolean;
  notes: string | null;
  lines: WarehousePackageLine[];
  /** Units, summed across lines. */
  unit_count: number;
  line_count: number;
  /** One entry per distinct person the contents belong to. */
  recipients: WarehouseRecipient[];
  /** More than one recipient — a master carton, broken down on landing. */
  is_consolidated: boolean;
  /** Any item on hold: the package cannot be sealed or shipped. */
  held_count: number;
  issue_count: number;
  box: { id: string; label: string | null; departs_at: string | null } | null;
  created_by_name: string | null;
  sealed_by_name: string | null;
  shipped_by_name: string | null;
  sealed_at: string | null;
  shipped_at: string | null;
  label_printed_at: string | null;
  label_print_count: number;
  created_at: string;
  updated_at: string;
}

export interface WarehouseReturnAddress {
  name: string;
  line1: string | null;
  line2: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
}

export interface WarehouseDashboard {
  counts: {
    /** EXPECTED: purchased (`processing`), not yet logged in at the hub. */
    awaiting: number;
    /** Paid but not yet marked purchased by an admin, not at the hub either. */
    not_bought: number;
    received: number;
    packing: number;
    sealed: number;
    shipped_7d: number;
    held: number;
    issues_open: number;
  };
  /** Packages on the bench and ready to go, newest activity first. */
  active: WarehousePackage[];
  /** The last few that left. */
  recently_shipped: WarehousePackage[];
  /** Received items not yet in any package, oldest first — the next job. */
  ready_to_pack: WarehouseItem[];
}

export interface WarehouseIssue {
  id: string;
  order_id: string;
  photo_id: string | null;
  verdict: "looks_right" | "wrong_item" | "wrong_variant" | "damaged" | "other";
  message: string;
  status: "open" | "in_review" | "resolved" | "dismissed";
  resolution: string | null;
  resolved_at: string | null;
  created_at: string;
  item: WarehouseItem | null;
}

export type LookupResult =
  | { kind: "package"; id: string; reference: string }
  | { kind: "order"; id: string; order_no: string }
  /** 086: a store parcel somebody registered (or logged) — open it. */
  | { kind: "inbound"; id: string; tracking_key: string }
  /** 086: a carrier barcode nobody registered — offer to link it or log it. */
  | { kind: "inbound_unmatched"; code: string };

// ── Inbound parcels (086) ───────────────────────────────────────────────────

export type InboundStatus = "expected" | "arrived" | "unmatched";

/** One Tomame order a store parcel belongs to, as the hub needs to see it. */
export interface InboundOrderRef {
  order_id: string;
  order_no: string;
  title: string;
  image_url: string | null;
  store: string | null;
  /** First name only: enough to shelve it, and what the label prints first. */
  first_name: string | null;
  stage: ItemStage;
  order_status: string;
  received_at: string | null;
  held: boolean;
}

export interface InboundParcel {
  id: string;
  /** Canonical key, upper case, letters and digits. */
  tracking_key: string;
  /** Grouped for reading. */
  tracking_display: string;
  carrier: string | null;
  carrier_label: string;
  status: InboundStatus;
  source: "registered" | "scanned";
  store_order_ref: string | null;
  note: string | null;
  orders: InboundOrderRef[];
  registered_by_name: string | null;
  arrived_at: string | null;
  arrived_by_name: string | null;
  created_at: string;
  /** Whole days since it was registered (expected) or logged (unmatched). */
  age_days: number;
}

export interface InboundCounts {
  expected: number;
  arrived: number;
  unmatched: number;
  /** Expected for more than `INBOUND_LATE_DAYS`. */
  late: number;
}

/** An expected parcel this many days old is late — chase the store. */
export const INBOUND_LATE_DAYS = 7;

/** Where a parcel opens. */
export function inboundParcelPath(id: string): string {
  return `/warehouse/inbound/${id}`;
}

/** The URL the QR code on a label opens. Relative; the label adds the origin. */
export function packageScanPath(reference: string): string {
  return `/warehouse/p/${encodeURIComponent(reference)}`;
}

/** Where a photo's bytes come from. The route re-checks the viewer each time. */
export function warehousePhotoUrl(photoId: string): string {
  return `/api/order-photos/${photoId}`;
}
