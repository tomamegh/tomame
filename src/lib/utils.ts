import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


export function getApiKey(key:string): string {
  const apiKey = process.env[key];
  if (!apiKey) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return apiKey;
}

export function getBrandConfig(platform: string): {pill:string, color: string, icon:string|null} {
  const p = platform.toLowerCase();
  if (p.includes("amazon"))
    return {
      pill: "bg-amber-50 text-amber-700 border border-amber-200/60",
      color: "#ff9900",
      icon: "/icons/Amazon.svg",
    };
  if (p.includes("ebay"))
    return {
      pill: "bg-blue-50 text-blue-700 border border-blue-200/60",
      color: "#0064d2",
      icon: "/icons/ebay.svg",
    };
  if (p.includes("shein"))
    return {
      pill: "bg-stone-100 text-stone-800 border border-stone-200",
      color: "#111827",
      icon: null,
    };
  if (p.includes("aliexpress"))
    return {
      pill: "bg-rose-50 text-rose-700 border border-rose-200/60",
      color: "#e62e04",
      icon: null,
    };
  return {
    pill: "bg-orange-50 text-orange-700 border border-orange-200/60",
    color: "#ff5c35",
    icon: null,
  };
}