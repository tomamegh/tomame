"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, ShieldIcon, UserIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AdminBadge } from "@/components/layout/admin";
import { apiFetch } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import type { PlatformRoles } from "@/features/auth/types";

import { roleBadge, roleChangeWarning, roleGrantSummary } from "./admin-user-format";

/**
 * The role control — the most consequential write an admin can make.
 *
 * WHAT THIS SESSION FIXED, and why the shape here matters. Until migration 051
 * any signed-in customer could `PATCH profiles` through PostgREST with the
 * publishable key and set `role = 'admin'` on their own row: RLS admitted the
 * update (the policy is `auth.uid() = id` and RLS cannot restrict an UPDATE to
 * a column subset) and nothing else stood in the way. The fix was a
 * column-level GRANT that makes `role` unwritable by `authenticated` at all.
 *
 * The consequence for this component is absolute: the ONLY way a role changes
 * is `PATCH /api/admin/users/[id]`, which authenticates the caller, requires
 * the admin role, writes through `updateUserRole` with a SERVICE-ROLE client
 * and records the change in `audit_logs`. This component must never reach for a
 * Supabase client of its own — a client-bound write would be refused by the
 * grant, and a "fix" that restored the grant would reopen the escalation.
 *
 * So the interaction is: pick the role, read what it grants, confirm. There is
 * no inline dropdown that commits on change, because the same click that gives
 * somebody every admin endpoint should not be the click that dismisses a menu.
 */

const ROLE_OPTIONS: { value: Extract<PlatformRoles, "user" | "admin">; label: string; Icon: typeof UserIcon }[] = [
  { value: "user", label: "Customer", Icon: UserIcon },
  { value: "admin", label: "Admin", Icon: ShieldIcon },
];

export function AdminRoleControl({
  userId,
  userLabel,
  currentRole,
  isSelf,
}: {
  userId: string;
  /** How the account is named in the confirmation — a name, or an email. */
  userLabel: string;
  currentRole: PlatformRoles;
  /** True when the admin is looking at their own account. */
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pendingRole, setPendingRole] = useState<PlatformRoles | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const badge = roleBadge(currentRole);

  async function commit(role: PlatformRoles) {
    setIsSaving(true);
    try {
      await apiFetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });

      toast.success({
        title: role === "admin" ? "Admin access granted" : "Admin access removed",
        description:
          role === "admin"
            ? `${userLabel} can now reach every admin screen and endpoint.`
            : `${userLabel} no longer has any admin access.`,
      });
      setPendingRole(null);
      router.refresh();
    } catch (error) {
      toast.error({
        title: "Could not change the role",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] leading-none font-semibold text-tm-text-2">
          Current role
        </span>
        <AdminBadge tone={badge.tone}>{badge.label}</AdminBadge>
      </div>

      <p className="max-w-[58ch] text-[13px] leading-[1.5] font-medium text-tm-text-2">
        {roleGrantSummary(currentRole)}
      </p>

      {currentRole === "system" ? (
        // A machine account. Offering the two human roles here would invite an
        // admin to convert it into something the platform does not expect.
        <p className="rounded-[14px] bg-tm-paper px-4 py-3 text-[13px] leading-[1.5] font-medium text-tm-text-2">
          System accounts are not changed from this screen.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {ROLE_OPTIONS.map(({ value, label, Icon }) => {
            const isCurrent = value === currentRole;
            return (
              <button
                key={value}
                type="button"
                disabled={isCurrent || isSaving}
                onClick={() => setPendingRole(value)}
                aria-pressed={isCurrent}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] leading-none font-semibold transition-colors",
                  isCurrent
                    ? "cursor-default border-tm-coral/40 bg-tm-pill-bg text-tm-coral-strong"
                    : "border-tm-border bg-card text-tm-text-2 hover:bg-tm-paper",
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {isCurrent ? `${label} (current)` : `Make ${label.toLowerCase()}`}
              </button>
            );
          })}
        </div>
      )}

      <AlertDialog
        open={pendingRole !== null}
        onOpenChange={(open) => {
          if (!open && !isSaving) setPendingRole(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingRole === "admin"
                ? `Make ${userLabel} an administrator?`
                : `Remove ${userLabel}'s admin access?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRole ? roleChangeWarning(currentRole, pendingRole, isSelf) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isSaving}
              onClick={(event) => {
                // The dialog closes itself on action; the request outlives that
                // unless it is held open until the write returns.
                event.preventDefault();
                if (pendingRole) void commit(pendingRole);
              }}
              className="bg-tm-coral text-white hover:bg-tm-coral-strong"
            >
              {isSaving ? <Loader2Icon className="size-3.5 animate-spin" aria-hidden /> : null}
              {pendingRole === "admin" ? "Grant admin access" : "Remove admin access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
