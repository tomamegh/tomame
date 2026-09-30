"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, UserCheckIcon, UserXIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AdminBadge } from "@/components/layout/admin";
import { apiFetch } from "@/lib/api-client";
import { toast } from "@/lib/sonner";

/**
 * "Deactivate account" / "Reactivate account".
 *
 * There is deliberately no delete: the account's orders, payments and audit
 * rows must outlive it. Deactivating bans the auth user, which stops sign-in
 * and token refresh; the server (`POST /api/admin/users/[id]/status`) refuses
 * it for the admin's own account and audits every change.
 */
export function AdminAccountStatus({
  userId,
  userLabel,
  deactivated,
  isSelf,
  isSystem,
}: {
  userId: string;
  userLabel: string;
  deactivated: boolean;
  /** True when the admin is looking at their own account. */
  isSelf: boolean;
  /** Machine accounts are not changed from this screen. */
  isSystem: boolean;
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const next = deactivated;

  async function commit() {
    setIsSaving(true);
    try {
      await apiFetch(`/api/admin/users/${userId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: next }),
      });
      toast.success({
        title: next ? "Account reactivated" : "Account deactivated",
        description: next
          ? `${userLabel} can sign in again.`
          : `${userLabel} can no longer sign in. Their orders and history are kept.`,
      });
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error({
        title: next ? "Could not reactivate the account" : "Could not deactivate the account",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] leading-none font-semibold text-tm-text-2">Account</span>
        <AdminBadge tone={deactivated ? "muted" : "green"}>{deactivated ? "Deactivated" : "Active"}</AdminBadge>
      </div>

      {isSelf || isSystem ? (
        <p className="text-[13px] leading-[1.5] font-medium text-tm-text-2">
          {isSelf ? "You cannot deactivate your own account." : "System accounts are not changed from this screen."}
        </p>
      ) : (
        <AlertDialog open={open} onOpenChange={(value) => !isSaving && setOpen(value)}>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="inline-flex w-fit items-center gap-1.5 rounded-full border border-tm-border bg-card px-3.5 py-2 text-[13px] leading-none font-semibold text-tm-text-2 transition-colors hover:bg-tm-paper"
            >
              {deactivated ? (
                <UserCheckIcon className="size-3.5" aria-hidden />
              ) : (
                <UserXIcon className="size-3.5" aria-hidden />
              )}
              {deactivated ? "Reactivate account" : "Deactivate account"}
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {deactivated ? `Reactivate ${userLabel}?` : `Deactivate ${userLabel}?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {deactivated
                  ? "They will be able to sign in again with their existing password."
                  : "They will not be able to sign in. A session that is already open ends within the hour. Orders, payments and the audit trail are kept, and you can reactivate the account at any time."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={isSaving}
                onClick={(event) => {
                  event.preventDefault();
                  void commit();
                }}
                className="bg-tm-coral text-white hover:bg-tm-coral-strong"
              >
                {isSaving ? <Loader2Icon className="size-3.5 animate-spin" aria-hidden /> : null}
                {deactivated ? "Reactivate" : "Deactivate"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
