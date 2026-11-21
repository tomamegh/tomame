import Link from "next/link";
import { ChatCircleDots, Sparkle, Storefront } from "@phosphor-icons/react/ssr";

import { buyForMeHref, type BuyForMeMode } from "@/features/extraction/components/buy-for-me-mode";
import { cn } from "@/lib/utils";

/**
 * Buy for me's three doors, as one segmented row (107/108).
 *
 * "Find it" is the assistant: words or links in one box, everything read and
 * priced in the thread. "Browse" is what we have already priced. "Ask a buyer"
 * hands it to a person. One tab, one switch, nothing scattered across tabs.
 *
 * No "use client": the server page draws it above the shop and the ask form,
 * and the chat screen draws it above the thread.
 */
export function BuyForMeSwitch({ mode, offerBrowse = true, className }: { mode: BuyForMeMode; offerBrowse?: boolean; className?: string }) {
  return (
    <nav
      aria-label="Ways to buy"
      className={cn("grid w-full auto-cols-fr grid-flow-col gap-1 rounded-[14px] bg-muted p-1 sm:w-fit", className)}
    >
      <SwitchLink href={buyForMeHref("paste")} active={mode === "paste"} icon={<Sparkle weight="fill" className="size-4 shrink-0" aria-hidden />} label="Find it" />
      {(offerBrowse || mode === "browse") && (
        <SwitchLink href={buyForMeHref("browse")} active={mode === "browse"} icon={<Storefront weight="bold" className="size-4 shrink-0" aria-hidden />} label="Browse" />
      )}
      <SwitchLink href={buyForMeHref("ask")} active={mode === "ask"} icon={<ChatCircleDots weight="bold" className="size-4 shrink-0" aria-hidden />} label="Ask a buyer" />
    </nav>
  );
}

function SwitchLink({ href, active, icon, label }: { href: string; active: boolean; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-[11px] px-3 text-[13.5px] leading-none font-semibold transition-colors",
        "focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none",
        active ? "bg-card text-foreground shadow-[0_1px_3px_rgba(43,36,34,0.12)]" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="hidden min-[400px]:inline-flex">{icon}</span>
      <span className="truncate">{label}</span>
    </Link>
  );
}
