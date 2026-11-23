"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { HandTap, Play, SignOut, Vibrate } from "@phosphor-icons/react";

import { createClient } from "@/lib/supabase/client";
import { haptic, hapticsEnabled, setHapticsEnabled, type HapticKind } from "@/lib/native/bridge";
import { cn } from "@/lib/utils";

const TOUR: HapticKind[] = ["light", "select", "medium", "heavy", "success", "warning"];

/** The Haptics switch and a "feel each one" demo. The switch lives on this phone only. */
export function HapticsControls() {
  const [on, setOn] = useState(true);
  useEffect(() => setOn(hapticsEnabled()), []);
  return (
    <>
      <button
        type="button"
        className="cell"
        onClick={() => {
          const next = !on;
          setHapticsEnabled(next);
          setOn(next);
          if (next) haptic("success");
        }}
      >
        <span className="ci" style={{ background: "#8b7cf6" }}><Vibrate size={17} weight="fill" /></span>
        Haptics
        <span className={cn("toggle", on && "on")} />
      </button>
      <button
        type="button"
        className="cell"
        disabled={!on}
        onClick={() => TOUR.forEach((k, i) => setTimeout(() => haptic(k), i * 650))}
      >
        <span className="ci" style={{ background: "#f9a58f" }}><HandTap size={17} weight="fill" /></span>
        Feel each haptic
        <span className="val">Play<Play size={14} /></span>
      </button>
    </>
  );
}

/** Sign out of Supabase, clear cached data, back to the welcome screen. */
export function SignOutCell() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="cell"
      disabled={busy}
      onClick={async () => {
        haptic("warning");
        setBusy(true);
        await createClient().auth.signOut().catch(() => undefined);
        queryClient.clear();
        window.location.assign("/m/welcome");
      }}
    >
      <span className="ci" style={{ background: "#8a7f79" }}><SignOut size={17} weight="bold" /></span>
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
