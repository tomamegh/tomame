"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Megaphone } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { useAnnouncementReceipt, useAnnouncements } from "../hooks/useAnnouncements";

/**
 * A message from the communication center (119), shown once as a pop-up on the
 * customer's next visit. Closing it keeps it in the bell; "Got it" or its link
 * dismisses it. It waits for the first-run tour, and never covers the bag or a
 * payment return, where the customer is in the middle of paying.
 */
export function AnnouncementPopup({ tourPending }: { tourPending: boolean }) {
  const pathname = usePathname() ?? "";
  const blocked = tourPending || pathname.startsWith("/app/bag") || pathname.startsWith("/app/transactions");
  const { data } = useAnnouncements({ enabled: !blocked });
  const receipt = useAnnouncementReceipt();
  const next = useMemo(() => data?.find((a) => !a.seen) ?? null, [data]);
  const [openId, setOpenId] = useState<string | null>(null);
  const shown = useRef(new Set<string>());

  useEffect(() => {
    if (!next || blocked || shown.current.has(next.id)) return;
    // A beat after the page settles, so it reads as news rather than a blocker.
    const timer = setTimeout(() => {
      shown.current.add(next.id);
      setOpenId(next.id);
      receipt.mutate({ id: next.id, dismissed: false });
    }, 900);
    return () => clearTimeout(timer);
  }, [next?.id, blocked]);

  const current = data?.find((a) => a.id === openId) ?? null;
  if (!current) return null;

  const dismiss = () => {
    receipt.mutate({ id: current.id, dismissed: true });
    setOpenId(null);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && setOpenId(null)}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <span className="mb-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-tm-pill-bg px-2.5 py-1 text-[11.5px] font-bold text-tm-coral-strong">
            <Megaphone weight="fill" className="size-3.5" aria-hidden />
            From Tomame
          </span>
          <DialogTitle className="font-display text-[20px] leading-tight font-bold text-tm-ink">{current.title}</DialogTitle>
          <DialogDescription className="text-[14px] leading-[1.55] font-medium whitespace-pre-line text-tm-text-2">{current.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          {current.link_href ? (
            <>
              <Button variant="ghost" className="rounded-full" onClick={dismiss}>
                Got it
              </Button>
              <Button asChild className="rounded-full" onClick={dismiss}>
                <Link href={current.link_href}>{current.link_label ?? "Open"}</Link>
              </Button>
            </>
          ) : (
            <Button className="rounded-full" onClick={dismiss}>
              Got it
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
