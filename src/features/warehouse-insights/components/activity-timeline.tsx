import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangleIcon,
  BoxIcon,
  CameraIcon,
  CircleDotIcon,
  EyeIcon,
  LockIcon,
  LockOpenIcon,
  LogInIcon,
  MessageSquareWarningIcon,
  PackageCheckIcon,
  PackagePlusIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  PrinterIcon,
  ScanLineIcon,
  ArrowRightLeftIcon,
  Trash2Icon,
  TruckIcon,
} from "lucide-react";

import { AdminBadge } from "@/components/layout/admin";
import { cn } from "@/lib/utils";

import { sentenceText } from "../describe";
import type { TimelineEntry, TimelineIcon, TimelineTone } from "../types";
import { absoluteTime, clockTime, dayHeading, groupByDay, relativeTime } from "./format";

/**
 * The warehouse's activity, as sentences under day headings (082).
 *
 * A server component: the rows arrive described, and nothing here reads the
 * clock except through `now`, which the page passes in once.
 */

const ICONS: Record<TimelineIcon, LucideIcon> = {
  received: PackageCheckIcon,
  package: PackagePlusIcon,
  packed: BoxIcon,
  sealed: LockIcon,
  reopened: LockOpenIcon,
  shipped: TruckIcon,
  label: PrinterIcon,
  status: ArrowRightLeftIcon,
  hold: PauseCircleIcon,
  release: PlayCircleIcon,
  issue: MessageSquareWarningIcon,
  photo: CameraIcon,
  signin: LogInIcon,
  page: EyeIcon,
  scan: ScanLineIcon,
  failed: AlertTriangleIcon,
  deleted: Trash2Icon,
  other: CircleDotIcon,
};

const TONE_DOT: Record<TimelineTone, string> = {
  neutral: "bg-tm-ink text-white",
  green: "bg-tm-green text-white",
  amber: "bg-tm-amber text-white",
  coral: "bg-tm-coral text-white",
  muted: "bg-tm-paper text-tm-text-3 ring-1 ring-tm-border",
};

const AVATAR: Record<string, string> = {
  warehouse: "bg-[linear-gradient(135deg,#e3f3ea,#d2ecdd)] text-tm-green-ink",
  admin: "bg-[var(--tm-gradient-avatar)] text-tm-coral-strong",
};

export function ActivityTimeline({ entries, now }: { entries: readonly TimelineEntry[]; now: Date }) {
  const groups = groupByDay(entries);
  return (
    <div className="flex flex-col">
      {groups.map((group) => (
        <section key={group.day} aria-label={dayHeading(group.rows[0]!.created_at, now)}>
          <h3 className="sticky top-0 z-[1] border-b border-tm-hairline bg-card/95 px-5 py-2.5 text-[12px] leading-none font-bold text-tm-text-2 backdrop-blur">
            {dayHeading(group.rows[0]!.created_at, now)}
          </h3>
          <ol className="flex flex-col">
            {group.rows.map((entry, i) => (
              <TimelineRow key={entry.id} entry={entry} now={now} last={i === group.rows.length - 1} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function TimelineRow({ entry, now, last }: { entry: TimelineEntry; now: Date; last: boolean }) {
  const Icon = ICONS[entry.icon];
  const actorName = entry.actor?.short_name ?? (entry.actor_role === "system" ? "The system" : "Someone");
  const role = entry.actor?.role ?? entry.actor_role;
  const text = sentenceText(actorName, entry.segments);

  return (
    <li className="relative flex gap-3.5 px-5 py-3.5 transition-colors hover:bg-tm-paper/60">
      {/* The thread between rows. Stops at the last row of the day. */}
      {!last ? (
        <span aria-hidden className="absolute top-[52px] bottom-0 left-[37px] w-px bg-tm-hairline" />
      ) : null}

      <div className="relative shrink-0">
        <span
          aria-hidden
          title={entry.actor?.name}
          className={cn(
            "flex size-9 items-center justify-center rounded-full text-[12px] leading-none font-bold",
            AVATAR[role] ?? "bg-tm-paper text-tm-text-2",
          )}
        >
          {entry.actor?.initials ?? "·"}
        </span>
        <span
          aria-hidden
          className={cn(
            "absolute -right-1 -bottom-1 flex size-[18px] items-center justify-center rounded-full ring-2 ring-card",
            TONE_DOT[entry.tone],
          )}
        >
          <Icon className="size-[11px]" strokeWidth={2.4} />
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <p className="min-w-0 text-[13.5px] leading-[1.45] text-tm-ink" title={text}>
            <span className="font-bold">{actorName}</span>{" "}
            {entry.segments.map((segment, i) => (
              <span key={i}>
                {"text" in segment ? (
                  <span className="font-medium text-tm-text-2">{segment.text}</span>
                ) : segment.href ? (
                  <Link
                    href={segment.href}
                    className="tm-nums rounded-[6px] bg-tm-tint px-1.5 py-0.5 font-semibold text-tm-coral-strong underline-offset-2 transition-colors hover:bg-tm-pill-bg hover:underline"
                  >
                    {segment.ref}
                  </Link>
                ) : (
                  <span className="tm-nums rounded-[6px] bg-tm-paper px-1.5 py-0.5 font-semibold text-tm-ink">
                    {segment.ref}
                  </span>
                )}
                {i < entry.segments.length - 1 ? " " : null}
              </span>
            ))}
            {entry.repeat > 1 ? (
              <span
                className="tm-nums ml-1.5 rounded-full bg-tm-paper px-1.5 py-0.5 text-[11.5px] font-bold text-tm-text-2 ring-1 ring-tm-border"
                title={`${entry.repeat} times in a row`}
              >
                ×{entry.repeat}
              </span>
            ) : null}
          </p>
          <time
            dateTime={entry.created_at}
            title={absoluteTime(entry.created_at)}
            className="tm-nums shrink-0 text-[12px] leading-[1.45] font-semibold whitespace-nowrap text-tm-text-3"
          >
            {relativeTime(entry.created_at, now)}
            <span className="font-medium">
              {" · "}
              {entry.repeat > 1 && clockTime(entry.earliest_at) !== clockTime(entry.created_at)
                ? `${clockTime(entry.earliest_at)}–${clockTime(entry.created_at)}`
                : clockTime(entry.created_at)}
            </span>
          </time>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminBadge tone={role === "admin" ? "coral" : role === "warehouse" ? "green" : "muted"} className="px-2 py-0.5 text-[11px]">
            {role === "admin" ? "Admin" : role === "warehouse" ? "Operator" : role}
          </AdminBadge>
          {entry.actor && entry.actor.name !== actorName ? (
            <span className="text-[12px] leading-none font-medium text-tm-text-3">{entry.actor.name}</span>
          ) : null}
          {entry.note ? (
            <span className="min-w-0 text-[12px] leading-[1.4] font-medium break-words text-tm-text-2">
              {entry.note}
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}
