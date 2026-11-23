"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { apiFetch } from "@/lib/api-client";
import { toast } from "@/lib/sonner";

/** Stop showing a message to anyone who has not dismissed it yet (119). */
export function WithdrawAnnouncementButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        if (!window.confirm(`Withdraw "${title}"? Customers who have not dismissed it stop seeing it.`)) return;
        setBusy(true);
        try {
          await apiFetch(`/api/admin/announcements/${id}/withdraw`, { method: "POST" });
          toast.success({ title: "Message withdrawn" });
          router.refresh();
        } catch (error) {
          toast.error({ title: "Couldn't withdraw it", description: error instanceof Error ? error.message : undefined });
          setBusy(false);
        }
      }}
      className="text-[12px] leading-none font-semibold text-tm-coral-strong underline-offset-2 hover:underline disabled:opacity-50"
    >
      {busy ? "Withdrawing…" : "Withdraw"}
    </button>
  );
}
