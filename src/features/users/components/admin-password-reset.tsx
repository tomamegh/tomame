"use client";

import { useState } from "react";
import { KeyRoundIcon, Loader2Icon } from "lucide-react";

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
import { apiFetch } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";

/**
 * "Send a password reset link".
 *
 * Behind a confirmation because it is not a read: it puts an email in a real
 * customer's inbox and invalidates nothing until they use it. An admin who
 * clicks it by accident has sent a stranger a security email they did not ask
 * for, and there is no way to unsend it.
 *
 * The route (`POST /api/admin/users/[id]/reset-password`) resolves the address
 * server-side from `auth.users` and audits the request. Nothing about the
 * target travels from this component except the id already in the URL.
 */
export function AdminPasswordReset({
  userId,
  email,
}: {
  userId: string;
  /** Shown in the confirmation so the admin can see where it is going. */
  email: string | null;
}) {
  const [isSending, setIsSending] = useState(false);
  const [open, setOpen] = useState(false);

  async function send() {
    setIsSending(true);
    try {
      await apiFetch(`/api/admin/users/${userId}/reset-password`, { method: "POST" });
      toast.success({
        title: "Reset link sent",
        description: email
          ? `${email} has been emailed a link to set a new password.`
          : "The account has been emailed a link to set a new password.",
      });
      setOpen(false);
    } catch (error) {
      toast.error({
        title: "Could not send the reset link",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !isSending && setOpen(next)}>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full border border-tm-border bg-card px-3.5 py-2 text-[13px] leading-none font-semibold text-tm-text-2 transition-colors hover:bg-tm-paper"
        >
          <KeyRoundIcon className="size-3.5" aria-hidden />
          Send a password reset link
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send a password reset link?</AlertDialogTitle>
          <AlertDialogDescription>
            {email
              ? `${email} will receive an email with a link to set a new password. Their current password keeps working until they use it.`
              : "The account will receive an email with a link to set a new password. Their current password keeps working until they use it."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isSending}
            onClick={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            {isSending ? <Loader2Icon className="size-3.5 animate-spin" aria-hidden /> : null}
            Send the email
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
