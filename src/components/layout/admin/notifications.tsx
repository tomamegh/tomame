"use client";

import { useState, useMemo } from "react";
import {
  BellIcon,
  MailIcon,
  MessageCircleIcon,
  SearchIcon,
  ArrowLeftIcon,
  CheckCircle2Icon,
  ClockIcon,
  XCircleIcon,
  BellOffIcon,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Item,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemHeader,
  ItemGroup,
  ItemSeparator,
} from "@/components/ui/item";
import { cn } from "@/lib/utils";
import { useAdminNotifications } from "@/features/notifications/hooks/useNotifications";
import type { NotificationResponse } from "@/features/notifications/services/notifications.service";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatEvent(event: string) {
  return event
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// "unread" for admin = pending or failed (needs attention)
function isUnread(n: NotificationResponse) {
  return n.status !== "sent";
}

// ── Status indicator ──────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  if (status === "sent")
    return <CheckCircle2Icon className="size-3 shrink-0 text-emerald-500" />;
  if (status === "pending")
    return <ClockIcon className="size-3 shrink-0 text-amber-500" />;
  return <XCircleIcon className="size-3 shrink-0 text-red-500" />;
}

// ── Detail view ───────────────────────────────────────────────────────────────

function NotificationDetail({
  notification,
  onBack,
}: {
  notification: NotificationResponse;
  onBack: () => void;
}) {
  const payload = notification.payload;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={onBack}
        >
          <ArrowLeftIcon className="size-3.5" />
        </Button>
        <span className="text-sm font-semibold text-stone-800 truncate">
          {formatEvent(notification.event)}
        </span>
      </div>

      <div className="overflow-y-auto flex-1 p-4 space-y-4">
        {/* Status row */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <StatusDot status={notification.status} />
            <span className="text-xs font-medium capitalize text-stone-600">
              {notification.status}
            </span>
          </div>
          <span className="text-stone-300">·</span>
          <span className="text-xs text-stone-500 capitalize">
            {notification.channel}
          </span>
          <span className="text-stone-300">·</span>
          <span className="text-xs text-stone-400">
            {relativeTime(notification.createdAt)}
          </span>
        </div>

        {/* Timestamps */}
        <div className="rounded-lg bg-stone-50 border border-stone-100 divide-y divide-stone-100 text-xs overflow-hidden">
          <Row label="Created" value={new Date(notification.createdAt).toLocaleString()} />
          {notification.sentAt && (
            <Row label="Sent at" value={new Date(notification.sentAt).toLocaleString()} />
          )}
          <Row
            label="User ID"
            value={
              <span className="font-mono text-stone-600">
                {notification.userId.slice(0, 16)}…
              </span>
            }
          />
          <Row
            label="Notification ID"
            value={
              <span className="font-mono text-stone-600">
                #{notification.id.slice(0, 8)}
              </span>
            }
          />
        </div>

        {/* Payload */}
        {Object.keys(payload).length > 0 && (
          <div>
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">
              Payload
            </p>
            <div className="rounded-lg bg-stone-50 border border-stone-100 divide-y divide-stone-100 text-xs overflow-hidden">
              {Object.entries(payload).map(([key, val]) => (
                <Row
                  key={key}
                  label={key}
                  value={
                    <span className="font-mono break-all text-right text-stone-600">
                      {typeof val === "object"
                        ? JSON.stringify(val)
                        : String(val)}
                    </span>
                  }
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-3 px-3 py-2">
      <span className="text-stone-400 shrink-0">{label}</span>
      <span className="text-stone-700 text-right min-w-0">{value}</span>
    </div>
  );
}

// ── List item ─────────────────────────────────────────────────────────────────

function NotifItem({
  notification,
  onClick,
}: {
  notification: NotificationResponse;
  onClick: () => void;
}) {
  const Icon =
    notification.channel === "email" ? MailIcon : MessageCircleIcon;
  const unread = isUnread(notification);

  return (
    <>
      <Item
        size="sm"
        className={cn(
          "cursor-pointer hover:bg-stone-50 rounded-none transition-colors",
          unread && "bg-amber-50/40 hover:bg-amber-50"
        )}
        onClick={onClick}
      >
        <ItemMedia variant="icon" className="shrink-0">
          <Icon />
        </ItemMedia>
        <ItemContent>
          <ItemHeader>
            <ItemTitle className="gap-1.5 text-sm leading-snug">
              {unread && (
                <span className="size-1.5 rounded-full bg-amber-500 shrink-0 mt-px" />
              )}
              {formatEvent(notification.event)}
            </ItemTitle>
            <div className="flex items-center gap-1 shrink-0 text-xs text-stone-400">
              <StatusDot status={notification.status} />
              {relativeTime(notification.createdAt)}
            </div>
          </ItemHeader>
          <ItemDescription className="text-xs capitalize">
            {notification.channel}
            {" · "}
            <span className="font-mono">#{notification.userId.slice(0, 8)}</span>
          </ItemDescription>
        </ItemContent>
      </Item>
      <ItemSeparator />
    </>
  );
}

// ── Skeleton loader ───────────────────────────────────────────────────────────

function NotifSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-8 rounded-sm shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-3 w-10 shrink-0" />
        </div>
      ))}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function AdminNotifications() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const [selected, setSelected] = useState<NotificationResponse | null>(null);

  // Fetch all; filter client-side
  const { data, isPending, error } = useAdminNotifications();

  const notifications = data?.notifications ?? [];
  const unreadCount = notifications.filter(isUnread).length;

  const filtered = useMemo(() => {
    let list = notifications;

    if (filter === "unread") list = list.filter(isUnread);
    else if (filter === "read") list = list.filter((n) => !isUnread(n));

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (n) =>
          n.event.toLowerCase().includes(q) ||
          n.channel.toLowerCase().includes(q) ||
          n.status.toLowerCase().includes(q) ||
          n.userId.toLowerCase().includes(q)
      );
    }

    return list;
  }, [notifications, filter, search]);

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) {
      // Reset detail view when closing
      setTimeout(() => setSelected(null), 200);
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="bg-slate-100 rounded-full relative"
        >
          <BellIcon className="size-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 size-4.5 min-w-4.5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-96 p-0 overflow-hidden flex flex-col"
        style={{ maxHeight: "min(560px, 80vh)" }}
      >
        {selected ? (
          /* ── Detail view ── */
          <NotificationDetail
            notification={selected}
            onBack={() => setSelected(null)}
          />
        ) : (
          /* ── List view ── */
          <div className="flex flex-col h-full" style={{ maxHeight: "inherit" }}>
            {/* Header */}
            <div className="px-4 pt-4 pb-3 border-b border-stone-100 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-stone-900 text-sm">
                  Notifications
                </h3>
                {unreadCount > 0 && (
                  <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 font-medium">
                    {unreadCount} unread
                  </span>
                )}
              </div>

              {/* Search */}
              <div className="relative">
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-stone-400 pointer-events-none" />
                <Input
                  placeholder="Search notifications..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>

              {/* Filter */}
              <Select
                value={filter}
                onValueChange={(v) =>
                  setFilter(v as "all" | "unread" | "read")
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    All ({notifications.length})
                  </SelectItem>
                  <SelectItem value="unread">
                    Unread ({unreadCount})
                  </SelectItem>
                  <SelectItem value="read">
                    Read ({notifications.length - unreadCount})
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Scrollable list */}
            <div className="overflow-y-auto flex-1 min-h-0">
              {isPending ? (
                <NotifSkeleton />
              ) : error ? (
                <div className="px-4 py-8 text-center text-sm text-red-500">
                  {error.message}
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-14 text-stone-400">
                  <BellOffIcon className="size-8" />
                  <p className="text-sm">No notifications found</p>
                </div>
              ) : (
                <ItemGroup>
                  {filtered.map((n) => (
                    <NotifItem
                      key={n.id}
                      notification={n}
                      onClick={() => setSelected(n)}
                    />
                  ))}
                </ItemGroup>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 border-t border-stone-100 flex items-center justify-between">
              <span className="text-xs text-stone-400">
                {filtered.length} of {notifications.length}
              </span>
              {(search || filter !== "all") && (
                <button
                  className="text-xs text-stone-400 hover:text-stone-700 transition-colors"
                  onClick={() => {
                    setSearch("");
                    setFilter("all");
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default AdminNotifications;
