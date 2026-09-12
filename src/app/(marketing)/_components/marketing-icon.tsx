import {
  AirplaneTilt,
  ArrowsLeftRight,
  Bank,
  DeviceMobile,
  Eye,
  HandHeart,
  HouseLine,
  Lightning,
  LinkSimple,
  Receipt,
  ShieldCheck,
  Truck,
} from "@phosphor-icons/react/ssr";
import type { Icon, IconWeight } from "@phosphor-icons/react";

/**
 * `site_content.data->>'icon'` carries a Phosphor component name
 * (037_seed_marketing_content.sql). Admins edit those rows, so the name is
 * untrusted input: anything unrecognised falls back rather than crashing the
 * page. Only the icons the seeded marketing rows actually name are bundled.
 */
const MARKETING_ICONS: Readonly<Record<string, Icon>> = {
  AirplaneTilt,
  ArrowsLeftRight,
  Bank,
  DeviceMobile,
  Eye,
  HandHeart,
  HouseLine,
  Lightning,
  LinkSimple,
  Receipt,
  ShieldCheck,
  Truck,
};

export interface MarketingIconProps {
  /** Phosphor component name from the content row, e.g. "HandHeart". */
  name: string | null;
  /** Duotone for feature icons, fill for status, bold for arrows. */
  weight?: IconWeight;
  className?: string;
}

export function MarketingIcon({
  name,
  weight = "duotone",
  className,
}: MarketingIconProps) {
  const Glyph = (name && MARKETING_ICONS[name]) || Receipt;
  return <Glyph weight={weight} className={className} aria-hidden="true" />;
}
