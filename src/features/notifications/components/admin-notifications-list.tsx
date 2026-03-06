"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BellOffIcon } from "lucide-react";
import { useAdminNotifications } from "../hooks/useNotifications";
import { NotificationItem } from "./notification-item";

export function AdminNotificationsList() {
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");

  const { data, isPending, error } = useAdminNotifications({
    status: status || undefined,
    channel: channel || undefined,
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={channel} onValueChange={setChannel}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All channels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-sm text-stone-400">{data?.count ?? 0} total</span>
      </div>

      {isPending && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
          {error.message}
        </div>
      )}

      {!isPending && data?.notifications.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-stone-400">
          <BellOffIcon className="w-10 h-10" />
          <p className="text-sm">No notifications found</p>
        </div>
      )}

      {data?.notifications.map((n) => (
        <NotificationItem key={n.id} notification={n} />
      ))}
    </div>
  );
}
