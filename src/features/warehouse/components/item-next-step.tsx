"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { ArrowDownIcon, BoxIcon, LinkIcon, ScaleIcon, ShoppingCartIcon } from "lucide-react";

import { AdminButton } from "@/components/layout/admin/controls";
import { cn } from "@/lib/utils";

import { BOARD_STAGE_META, BOARD_STAGES } from "../board/stage";
import type { BoardItem } from "../types";
import { PurchaseSheet, TrackingSheet } from "./board-sheets";
import { ReceiveDialog } from "./receive-dialog";
import { PackItemsButton } from "./warehouse-actions";

/**
 * The order page's answer to "what now?": where it is on the nine stages, and
 * the one button that moves it on. Same stages and sheets as the board.
 */
export function ItemNextStep({ item, isAdmin, sameCheckout }: { item: BoardItem; isAdmin: boolean; sameCheckout: BoardItem[] }) {
  const [sheet, setSheet] = useState<"purchase" | "tracking" | "receive" | null>(null);
  const stage = item.board_stage;
  const meta = BOARD_STAGE_META[stage];
  const at = BOARD_STAGES.indexOf(stage);

  return (
    <section className="tm-up flex flex-col gap-4 overflow-hidden rounded-[22px] bg-tm-ink p-5 text-white [animation-duration:0.5s] sm:p-6">
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-bold tracking-[0.08em] text-white/55 uppercase">{meta.next ? "Next step" : "Done"}</span>
        <h2 className="font-display text-[20px] leading-tight font-bold">
          {meta.label}
          {meta.next ? <span className="text-white/55"> → {stage === "boxed" && item.package ? `finish ${item.package.reference}` : meta.next.toLowerCase()}</span> : null}
        </h2>
        <p className="max-w-[70ch] text-[13px] leading-[1.5] font-medium text-white/70">{meta.hint}</p>
      </div>

      {/* The nine stages, this order's highlighted. */}
      <ol className="flex items-center gap-1" aria-label="Stages">
        {BOARD_STAGES.map((s, i) => (
          <li key={s} className="flex flex-1 flex-col gap-1.5" title={BOARD_STAGE_META[s].label}>
            <motion.span
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.05 * i, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className={cn("h-1.5 origin-left rounded-full", i < at ? "bg-tm-green" : i === at ? "bg-tm-coral" : "bg-white/15")}
            />
            <span className={cn("hidden truncate text-[10.5px] font-semibold md:block", i === at ? "text-white" : "text-white/40")}>{BOARD_STAGE_META[s].label}</span>
          </li>
        ))}
      </ol>

      {item.held ? (
        <p className="text-[13px] font-semibold text-white/80">On hold: release it before it moves on.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {stage === "to_buy" ? (
            isAdmin ? (
              <AdminButton variant="primary" onClick={() => setSheet("purchase")}>
                <ShoppingCartIcon className="size-4" aria-hidden />
                Mark purchased
              </AdminButton>
            ) : (
              <span className="inline-flex h-10 items-center rounded-full border border-dashed border-white/30 px-4 text-[13px] font-semibold text-white/60">Waiting for a buyer</span>
            )
          ) : null}
          {stage === "purchased" || stage === "on_way" ? (
            <AdminButton variant={stage === "purchased" ? "primary" : "secondary"} className={stage === "on_way" ? "border-white/15 bg-white/10 text-white hover:bg-white/20" : undefined} onClick={() => setSheet("tracking")}>
              <LinkIcon className="size-4" aria-hidden />
              {item.tracking.length ? "Store tracking" : "Add tracking"}
            </AdminButton>
          ) : null}
          {stage === "on_way" || stage === "purchased" ? (
            <AdminButton variant={stage === "on_way" ? "primary" : "secondary"} className={stage === "purchased" ? "border-white/15 bg-white/10 text-white hover:bg-white/20" : undefined} onClick={() => setSheet("receive")}>
              <ScaleIcon className="size-4" aria-hidden />
              Receive
            </AdminButton>
          ) : null}
          {stage === "at_hub" ? <PackItemsButton orderIds={[item.order_id]} label="Pack into a box" /> : null}
          {stage === "boxed" && item.package ? (
            <Link href={`/warehouse/packages/${item.package.id}`} className="tm-cta-gradient inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold text-white">
              <BoxIcon className="size-4" aria-hidden />
              Open {item.package.reference}
            </Link>
          ) : null}
          {stage === "in_flight" || stage === "in_accra" || stage === "out" ? (
            <a href="#status" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-4 text-[13px] font-semibold text-white hover:bg-white/20">
              <ArrowDownIcon className="size-4" aria-hidden />
              Move it in Status below
            </a>
          ) : null}
        </div>
      )}

      <PurchaseSheet open={sheet === "purchase"} onOpenChange={(o) => !o && setSheet(null)} items={[item]} sameCheckout={sameCheckout} />
      <TrackingSheet open={sheet === "tracking"} onOpenChange={(o) => !o && setSheet(null)} items={[item]} />
      {sheet === "receive" ? <ReceiveDialog item={item} open onOpenChange={(o) => !o && setSheet(null)} /> : null}
    </section>
  );
}
