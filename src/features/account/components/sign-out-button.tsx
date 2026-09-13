"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { SignOut } from "@phosphor-icons/react/ssr";

import { createClient } from "@/lib/supabase/client";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";

/**
 * The one way out of a signed-in session on the v2 shell.
 *
 * The redesign dropped `dashboard-navbar.tsx` — and with it the only Sign Out
 * control — and put nothing in its place: the avatar leads to `/app/account`,
 * and no tab there ended the session. A customer on a shared phone had no way
 * to leave except clearing site data.
 *
 * Two things happen on the way out, in this order. `signOut()` on the browser
 * client clears the Supabase cookies (`@supabase/ssr` writes them from here).
 * Then the React Query cache is emptied BEFORE navigating: the bag, the pastes
 * and the notification list are all cached by key with no viewer in the key,
 * so the next person to sign in on this browser would briefly see the previous
 * customer's bag until the first refetch landed. `router.refresh()` last, so
 * the server components re-render with no session.
 */
export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const signOut = useCallback(async () => {
    setBusy(true);
    try {
      const { error } = await createClient().auth.signOut();
      if (error) throw error;
      queryClient.clear();
      router.replace("/");
      router.refresh();
    } catch (error) {
      setBusy(false);
      toast.error({
        title: "Could not sign you out",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    }
  }, [queryClient, router]);

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      aria-busy={busy}
      className={cn(
        "flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 transition-colors",
        "text-sm leading-none font-semibold whitespace-nowrap",
        "text-tm-text-2 hover:bg-tm-hairline hover:text-tm-ink",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tm-coral",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      <SignOut weight="duotone" className="size-5 shrink-0" aria-hidden />
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
