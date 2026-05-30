import { ZapIcon, ShieldCheckIcon, GlobeIcon } from "lucide-react";

export const FEATURE_BADGES = [
  { label: "Fast Processing", Icon: ZapIcon, color: "text-orange-500", bg: "bg-orange-50" },
  { label: "Secure & Safe", Icon: ShieldCheckIcon, color: "text-orange-500", bg: "bg-orange-50" },
  { label: "Worldwide Shipping", Icon: GlobeIcon, color: "text-purple-500", bg: "bg-purple-50" },
] as const;


export const SUPPORTED_STORES = [
  {
    id: "amazon",
    name: "Amazon",
    logo: "/icons/amazon.svg",
    url: "https://www.amazon.com",
  },
  {
    id: "ebay",
    name: "eBay",
    logo: "/icons/ebay.svg",
    url: "https://www.ebay.com",
  },
  {
    id: "shein",
    name: "SHEIN",
    logo: null,
    url: "https://www.shein.com",
    textClassName: "text-stone-900",
  },
  {
    id: "microcenter",
    name: "MICROCENTER",
    logo: null,
    url: "https://www.microcenter.com",
    textClassName: "text-stone-700",
  },
] as const;


export const PAYMENT_METHODS = [
  'MTN MoMo',
  'Vodafone Cash',
  'AirtelTigo',
  'Visa / Mastercard',
] as const;