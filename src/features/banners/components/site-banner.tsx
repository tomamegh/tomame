"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle, Info, Megaphone, WarningCircle, X } from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";
import type { BannerTone, LiveBanner } from "../types";

const TONE: Record<BannerTone, { box: string; icon: string; Icon: typeof Info }> = {
  info: { box: "border-tm-border bg-tm-paper", icon: "text-tm-text-2", Icon: Info },
  warning: { box: "border-tm-amber/40 bg-tm-amber-bg", icon: "text-tm-amber", Icon: WarningCircle },
  success: { box: "border-tm-green/30 bg-tm-green-bg", icon: "text-tm-green-ink", Icon: CheckCircle },
  promo: { box: "border-tm-coral/30 bg-tm-tint", icon: "text-tm-coral", Icon: Megaphone },
};

/** Dismissal is per banner VERSION: editing the wording shows it again. */
const dismissKey = (banner: LiveBanner) => `tm-banner-dismissed:${banner.id}:${banner.updated_at}`;

function readDismissed(banner: LiveBanner): boolean {
  try {
    return window.localStorage.getItem(dismissKey(banner)) === "1";
  } catch {
    return false;
  }
}

/**
 * One admin-written banner (089). Rendered by `BannerSlot`; the copy, tone and
 * link are the admin's, the look is fixed so no banner can break a page.
 */
export function SiteBanner({ banner, className }: { banner: LiveBanner; className?: string }) {
  // Starts visible on both server and client so hydration agrees; a dismissed
  // banner is hidden right after mount.
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (banner.dismissible && readDismissed(banner)) setHidden(true);
  }, [banner]);

  if (hidden) return null;
  const tone = TONE[banner.tone] ?? TONE.info;
  const external = banner.link_url?.startsWith("https://") ?? false;

  return (
    <aside
      role="note"
      aria-label={banner.title}
      className={cn("tm-up flex items-start gap-3 rounded-[18px] border px-4 py-3.5 [animation-duration:0.4s]", tone.box, className)}
    >
      <tone.Icon weight="duotone" className={cn("mt-px size-5 shrink-0", tone.icon)} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-[14px] leading-[1.3] font-bold text-tm-ink">{banner.title}</p>
        {banner.body && <p className="text-[13px] leading-[1.5] font-medium text-tm-text-2">{banner.body}</p>}
        {banner.link_url && banner.link_label && (
          <Link
            href={banner.link_url}
            {...(external && { target: "_blank", rel: "noopener noreferrer" })}
            className="mt-0.5 inline-flex w-fit items-center gap-1 text-[13px] leading-none font-bold text-tm-coral-strong hover:underline"
          >
            {banner.link_label}
            <ArrowRight weight="bold" className="size-3.5" aria-hidden />
          </Link>
        )}
      </div>
      {banner.dismissible && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            setHidden(true);
            try {
              window.localStorage.setItem(dismissKey(banner), "1");
            } catch {
              // Private mode: hidden for this visit only.
            }
          }}
          className="-mt-0.5 -mr-1 rounded-full p-1 text-tm-text-3 transition-colors hover:text-tm-ink"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </aside>
  );
}
