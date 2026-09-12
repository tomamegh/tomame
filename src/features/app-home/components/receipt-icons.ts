import type { Icon } from "@phosphor-icons/react";
import {
  AirplaneTilt,
  ArrowsLeftRight,
  Bank,
  HandHeart,
  Tag,
} from "@phosphor-icons/react/ssr";

import type { ReceiptRowIcon } from "./format";

/**
 * One duotone glyph per receipt line, keyed by the row `buildReceiptRows`
 * emitted.
 *
 * Shared rather than redeclared: the Home card and the landed-price screen
 * print the same five rows from the same builder, and a second copy of this map
 * is a second place for the freight line to quietly become a truck.
 */
export const RECEIPT_ROW_ICONS: Record<ReceiptRowIcon, Icon> = {
  item: Tag,
  tax: Bank,
  fee: HandHeart,
  freight: AirplaneTilt,
  rate: ArrowsLeftRight,
};
