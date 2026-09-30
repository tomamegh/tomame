import Link from "next/link";
import { PackageIcon, PauseCircleIcon, TriangleAlertIcon } from "lucide-react";

import { AdminBadge } from "@/components/layout/admin/admin-page";
import { cn } from "@/lib/utils";

import type { ItemStage, PackageStatus, WarehouseItem } from "../types";
import { warehousePhotoUrl } from "../types";
import { PACKAGE_META, STAGE_META, recipientPlace } from "./format";

/**
 * Small, directive-free building blocks shared by every warehouse screen (081).
 * No hooks here, so server pages and client components can both render them.
 */

/**
 * The picture of an item: the hub's own photo when there is one — it shows the
 * actual parcel — otherwise the store's listing image, otherwise a glyph.
 * Plain <img>: listing images come from any store's CDN and the photo route
 * streams bytes with its own headers; neither belongs in the image optimiser.
 */
export function ItemThumb({
  item,
  size = 56,
  className,
  rounded = 14,
}: {
  item: Pick<WarehouseItem, "photo_ids" | "image_url" | "title">;
  size?: number;
  className?: string;
  rounded?: number;
}) {
  const hubPhoto = item.photo_ids[0];
  const src = hubPhoto ? warehousePhotoUrl(hubPhoto) : item.image_url;
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden border border-tm-hairline bg-white",
        className,
      )}
      style={{ width: size, height: size, borderRadius: rounded }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className={cn("size-full", hubPhoto ? "object-cover" : "object-contain p-1.5")}
        />
      ) : (
        <PackageIcon className="size-1/2 text-tm-text-3" aria-hidden />
      )}
      {hubPhoto ? (
        <span className="absolute right-1 bottom-1 size-2 rounded-full bg-tm-green ring-2 ring-white" title="Hub photo" />
      ) : null}
    </span>
  );
}

export function StageBadge({ stage }: { stage: ItemStage }) {
  const meta = STAGE_META[stage];
  return <AdminBadge tone={meta.tone}>{meta.label}</AdminBadge>;
}

export function PackageStatusBadge({ status }: { status: PackageStatus }) {
  const meta = PACKAGE_META[status];
  return (
    <AdminBadge tone={meta.tone}>
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "packing" && "animate-pulse bg-tm-amber",
          status === "sealed" && "bg-tm-coral",
          status === "shipped" && "bg-tm-green",
        )}
      />
      {meta.label}
    </AdminBadge>
  );
}

/** Held and objected-to items are flagged everywhere they appear. */
export function ItemFlags({ item }: { item: Pick<WarehouseItem, "held" | "has_open_issue"> }) {
  if (!item.held && !item.has_open_issue) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {item.held ? (
        <AdminBadge tone="coral">
          <PauseCircleIcon className="size-3" aria-hidden />
          On hold
        </AdminBadge>
      ) : null}
      {item.has_open_issue ? (
        <AdminBadge tone="amber">
          <TriangleAlertIcon className="size-3" aria-hidden />
          Customer issue
        </AdminBadge>
      ) : null}
    </span>
  );
}

/** One line of an item: picture, name, who it is for. Links to the item. */
export function ItemLine({
  item,
  trailing,
  href = `/warehouse/items/${item.order_id}`,
  quantity,
}: {
  item: WarehouseItem;
  trailing?: React.ReactNode;
  href?: string | null;
  quantity?: number;
}) {
  const body = (
    <>
      <ItemThumb item={item} size={52} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="line-clamp-1 text-[14px] leading-tight font-semibold text-tm-ink">{item.title}</span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] font-medium text-tm-text-3">
          <span className="font-mono text-tm-text-2">{item.order_no}</span>
          <span aria-hidden>·</span>
          <span className="truncate">{item.recipient.name ?? "Unnamed customer"}</span>
          {recipientPlace(item.recipient) ? (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{recipientPlace(item.recipient)}</span>
            </>
          ) : null}
          {(quantity ?? item.quantity) > 1 ? (
            <span className="rounded-full bg-tm-ink px-1.5 py-0.5 text-[10px] leading-none font-bold text-white">
              ×{quantity ?? item.quantity}
            </span>
          ) : null}
        </span>
        <ItemFlags item={item} />
      </span>
      {trailing}
    </>
  );
  const className = "flex min-w-0 items-center gap-3";
  return href ? (
    <Link href={href} className={cn(className, "rounded-[14px] transition-colors hover:bg-tm-paper/70")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** Page heading for warehouse screens: a kicker, a title, a line, actions. */
export function WarehouseHeading({
  kicker,
  title,
  blurb,
  action,
}: {
  kicker?: string;
  title: React.ReactNode;
  blurb?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <header className="tm-up flex flex-wrap items-end justify-between gap-4 [animation-duration:0.5s]">
      <div className="flex min-w-0 flex-col gap-1.5">
        {kicker ? (
          <span className="text-[11px] font-bold tracking-[0.16em] text-tm-coral-strong uppercase">{kicker}</span>
        ) : null}
        <h1 className="font-display text-[28px] leading-none font-bold tracking-[-0.02em] text-tm-ink sm:text-[32px]">
          {title}
        </h1>
        {blurb ? (
          <p className="max-w-[64ch] text-[13.5px] leading-[1.5] font-medium text-tm-text-2">{blurb}</p>
        ) : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}
