"use client";

import { useState } from "react";

import { AdminBadge, AdminEmpty } from "@/components/layout/admin";
import { apiFetch } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import type { ErrorIssueRow } from "@/db/queries/error-events";
import { formatRelativeTime } from "@/features/app-home/components/format";

/**
 * The open issues, with the one action an admin has: "I have looked at this."
 *
 * A client island rather than a server table because filing an issue should not
 * cost a page navigation, and because the row has to disappear when it is
 * filed. It stays filed only until the error happens again: the write in 062
 * clears `resolved_at` on the next occurrence, so a bug that comes back returns
 * to this list on its own.
 */
export function ErrorIssueList({ issues, renderedAt }: { issues: ErrorIssueRow[]; renderedAt: string }) {
  const now = new Date(renderedAt);
  const [filed, setFiled] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const visible = issues.filter((i) => !filed[i.fingerprint]);

  if (visible.length === 0) {
    return <AdminEmpty title="Nothing unhandled" body="No error has been recorded that somebody has not already looked at." />;
  }

  /**
   * A failure here must SAY so. Filing silently doing nothing would be exactly
   * the bug this whole screen exists to catch, on the screen that catches it:
   * the row would stay put with no explanation and the admin would assume the
   * click missed. `apiFetch` throws on a non-2xx, which is what carries the
   * server's message into the toast.
   */
  async function file(fingerprint: string) {
    setBusy(fingerprint);
    try {
      await apiFetch(`/api/admin/ops/errors/${fingerprint}`, { method: "POST" });
      setFiled((f) => ({ ...f, [fingerprint]: true }));
    } catch (error) {
      toast.error({
        title: "Could not file that issue",
        description: error instanceof Error ? error.message : "Something went wrong.",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {visible.map((issue) => (
        <li key={issue.fingerprint} className="flex flex-col gap-2 rounded-[14px] bg-tm-paper px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <AdminBadge tone={issue.level === "error" ? "coral" : "amber"}>{issue.occurrences}x</AdminBadge>
            {issue.source ? (
              <span className="font-mono text-[11px] text-tm-text-3">{issue.source}</span>
            ) : null}
            <span className="text-[12px] font-medium text-tm-text-3">
              first {formatRelativeTime(issue.first_seen_at, now) ?? issue.first_seen_at}, last{" "}
              {formatRelativeTime(issue.last_seen_at, now) ?? issue.last_seen_at}
            </span>
          </div>
          <p className="text-[13px] leading-[1.45] font-semibold break-words text-tm-ink">{issue.message}</p>
          {issue.context ? (
            <details>
              <summary className="cursor-pointer text-[12px] font-semibold text-tm-text-2">Details</summary>
              <pre className="mt-1.5 overflow-x-auto rounded-[10px] bg-tm-tint px-3 py-2 text-[11px] leading-[1.5] text-tm-text-2">
                {JSON.stringify(issue.context, null, 2)}
              </pre>
            </details>
          ) : null}
          <button
            type="button"
            onClick={() => void file(issue.fingerprint)}
            disabled={busy === issue.fingerprint}
            className="self-start rounded-full border border-tm-border px-3 py-1.5 text-[12px] font-semibold text-tm-ink transition-colors hover:bg-tm-tint disabled:opacity-50"
          >
            {busy === issue.fingerprint ? "Filing" : "I have looked at this"}
          </button>
        </li>
      ))}
    </ul>
  );
}
