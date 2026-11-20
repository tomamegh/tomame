"use client";

import { buyForMeHref } from "@/features/extraction/components/buy-for-me-mode";
import { AskBar } from "@/features/finder/components/ask-bar";
import { cn } from "@/lib/utils";

export interface PasteBarProps {
  stores?: readonly string[];
  className?: string;
}

/** The landing hero's box, the same as signed-in Home's: words start the AI price finder, links are priced. */
export function PasteBar({ stores, className }: PasteBarProps) {
  return <AskBar pasteHref={buyForMeHref("paste")} stores={stores} inputId="hero-product-url" className={cn("max-w-[640px]", className)} />;
}
