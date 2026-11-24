"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { apiFetch } from "@/lib/api-client";
import type { ApiSuccessResponse } from "@/types/api";
import { ensureNotificationPermission, isNative, localNotifications, onAppResume, onNotificationTap } from "@/lib/native/bridge";
import type { AppReminder } from "../alerts";

/** A stable positive 31-bit id per reminder key, so a reschedule replaces the same notification. */
export function reminderId(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 1) || 1;
}

/**
 * Inside the iPhone app only: keeps the phone's Tomame reminders (box closing, rate lock,
 * delivery day) in step with the server every time the app opens or comes back, and opens
 * the right screen when a notification is tapped. Alerts the server learns of later are
 * posted by the native background check (native/ios/App/App/AppDelegate.swift).
 */
export function NativeNotifications() {
  const router = useRouter();

  useEffect(() => {
    if (!isNative()) return;
    const sync = async () => {
      const ln = localNotifications();
      if (!ln || !(await ensureNotificationPermission())) return;
      try {
        const { reminders } = (await apiFetch<ApiSuccessResponse<{ reminders: AppReminder[] }>>("/api/app/reminders")).data;
        const pending = await ln.getPending();
        const ours = pending.notifications.filter((n) => n.extra?.kind === "reminder");
        if (ours.length) await ln.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
        if (reminders.length) {
          await ln.schedule({
            notifications: reminders.map((r) => ({
              id: reminderId(r.key),
              title: r.title,
              body: r.body,
              schedule: { at: new Date(r.at), allowWhileIdle: true },
              extra: { href: r.href, kind: "reminder" },
            })),
          });
        }
      } catch {
        // Reminders are a nicety: a failed sync leaves the last set in place.
      }
    };
    // Never on the first paint: it waits until the screen is up, and runs at most every 30 min.
    const KEY = "tm-reminders-synced";
    const maybeSync = () => {
      try {
        const last = Number(window.localStorage.getItem(KEY) ?? 0);
        if (Date.now() - last < 30 * 60_000) return;
        window.localStorage.setItem(KEY, String(Date.now()));
      } catch {
        // No storage: sync anyway.
      }
      void sync();
    };
    const first = window.setTimeout(maybeSync, 6000);
    const offResume = onAppResume(maybeSync);
    const offTap = onNotificationTap((href) => router.push(href));
    return () => {
      window.clearTimeout(first);
      offResume();
      offTap();
    };
  }, [router]);

  return null;
}
