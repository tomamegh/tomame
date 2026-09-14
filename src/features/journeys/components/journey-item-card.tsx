import Image from "next/image";
import { ArrowSquareOut, ChatsCircle, Storefront } from "@phosphor-icons/react/ssr";

import { formatLbs } from "@/features/bag/components/format";
import type { JourneyItem } from "../types";

export interface JourneyItemCardProps {
  item: JourneyItem;
  /** `orders.special_instructions`. Null when the customer left none. */
  note: string | null;
  /** From `site_settings.whatsapp_number`; the button is omitted when unset. */
  whatsappHref: string | null;
  /** Named in the WhatsApp message so the agent knows which parcel is meant. */
  orderNo: string;
}

/**
 * The right rail of `v2-detail` (design lines 363–369): the listing photo, the
 * store chip, the variant line, the outbound link, the customer's own note, and
 * "Ask about this journey".
 *
 * **"Ask about this journey" is a WhatsApp DEEP LINK, not a message thread.**
 * Kelvin's decision of 2026-09-13 for the assisted-request flow applies here for
 * consistency, so `message_threads`/`messages` (data map §"Phase 5 specs") are
 * deferred and nothing is stored. The number comes from
 * `site_settings.whatsapp_number` through `whatsappHref`, which converts a
 * leading national `0` to Ghana's country code — the button is simply not drawn
 * when no number is configured, rather than linking to `wa.me/` with no digits.
 *
 * Enters on the mock's `tmUp .5s .08s`.
 */
export function JourneyItemCard({ item, note, whatsappHref, orderNo }: JourneyItemCardProps) {
  const meta = [item.variant, `Qty ${item.quantity}`, item.weightLbs != null ? formatLbs(item.weightLbs) : null]
    .filter((part): part is string => !!part)
    .join(" · ");

  return (
    <aside className="tm-up flex flex-col gap-3.5 [animation-delay:0.08s] [animation-duration:0.5s]">
      <div className="flex flex-col gap-3.5 rounded-[24px] border border-tm-border bg-card p-[22px]">
        {item.imageUrl ? (
          <span className="relative h-[220px] overflow-hidden rounded-2xl bg-[repeating-linear-gradient(135deg,#F6EDE7_0_8px,#EFE4DC_8px_16px)]">
            <Image
              src={item.imageUrl}
              alt=""
              fill
              sizes="(min-width: 1024px) 336px, 100vw"
              className="object-contain"
            />
          </span>
        ) : (
          <span
            aria-hidden
            className="h-[220px] rounded-2xl bg-[repeating-linear-gradient(135deg,#F6EDE7_0_8px,#EFE4DC_8px_16px)]"
          />
        )}

        <div className="flex flex-col gap-1.5">
          {/*
            "Amazon · USA". The store half is dropped when the URL matches no
            store we know; the origin is always on the order.
          */}
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-tm-pill-bg px-2.5 py-1.5 text-[11px] leading-none font-semibold text-tm-text-2">
            <Storefront weight="duotone" className="size-3.5 text-tm-coral" aria-hidden />
            {[item.store, item.country].filter(Boolean).join(" · ")}
          </span>

          {meta && (
            <p className="text-sm leading-[1.35] font-semibold break-words">{meta}</p>
          )}

          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[13px] leading-none font-medium text-tm-coral"
          >
            View listing
            <ArrowSquareOut className="size-3.5" aria-hidden />
          </a>
        </div>

        {note && (
          <p className="rounded-xl bg-tm-amber-bg px-3.5 py-3 text-[13px] leading-[1.4] font-normal text-tm-text-2">
            <b className="text-tm-ink">Your note:</b> {note}
          </p>
        )}
      </div>

      {whatsappHref && (
        <a
          href={`${whatsappHref}?text=${encodeURIComponent(`Hi Tomame — a question about ${orderNo}.`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-12 items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-tm-border bg-card text-sm leading-none font-semibold"
        >
          <ChatsCircle weight="duotone" className="size-[18px] text-tm-coral" aria-hidden />
          Ask about this journey
        </a>
      )}
    </aside>
  );
}
