"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";
import { CaretLeft } from "@phosphor-icons/react";

import { haptic } from "@/lib/native/bridge";

type Kind = Parameters<typeof haptic>[0];

/** A link that taps back: the iPhone app's haptic on every navigation a server screen renders. */
export function Tap({ haptic: kind = "light", onClick, ...props }: ComponentProps<typeof Link> & { haptic?: Kind }) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        haptic(kind);
        onClick?.(e);
      }}
    />
  );
}

/** The sticky top bar of a pushed screen: back, a centred title, optional actions. */
export function NavBar({ title, back, backHref, actions }: { title: string; back: string; backHref: string; actions?: ReactNode }) {
  const router = useRouter();
  return (
    <div className="navbar">
      <button
        type="button"
        className="back"
        onClick={() => {
          haptic("light");
          // Back where the customer came from when there is history inside the app, else the parent.
          if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) router.back();
          else router.push(backHref);
        }}
      >
        <CaretLeft weight="bold" />
        {back}
      </button>
      <span className="title">{title}</span>
      <div className="acts">{actions}</div>
    </div>
  );
}
