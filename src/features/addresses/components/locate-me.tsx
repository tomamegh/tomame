"use client";

import { useCallback, useState } from "react";
import { CheckCircle, Crosshair, X } from "@phosphor-icons/react/ssr";

import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { ApiSuccessResponse } from "@/types/api";
import type { LocateResult } from "../services/address-lookup.service";

/** What a located pin hands the form: the pin itself plus whatever the lookup could fill. */
export interface LocatedFields {
  latitude: number;
  longitude: number;
  line1: string | null;
  area: string | null;
  city: string | null;
  region: string | null;
  delivery_zone_id: string | null;
}

type Phase =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; filled: boolean; accuracy: number | null }
  | { kind: "error"; message: string };

export interface LocateMeState {
  phase: Phase;
  run: (onLocated: (found: LocatedFields) => void) => void;
  reset: () => void;
}

/** Rounded to ~11 cm — the precision 088's NUMERIC(9,6) stores. */
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

function geolocationMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) return "Location access is off for this site. Type your address below, or allow location in your browser settings.";
  if (error.code === error.TIMEOUT) return "Finding your location took too long. Try again outside or near a window, or type your address below.";
  return "We could not get your location. Type your address below.";
}

/**
 * "Use my current location": the browser's own geolocation (no key, no vendor),
 * then `POST /api/addresses/locate` to turn the pin into words when the admin
 * has lookup switched on. The pin is kept whether or not the lookup filled
 * anything — it is what gets the courier to the gate.
 */
export function useLocateMe(): LocateMeState {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const run = useCallback((onLocated: (found: LocatedFields) => void) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setPhase({ kind: "error", message: "This browser cannot share a location. Type your address below." });
      return;
    }
    setPhase({ kind: "busy" });
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latitude = round6(position.coords.latitude);
        const longitude = round6(position.coords.longitude);
        const accuracy = Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy) : null;
        let result: LocateResult | null = null;
        try {
          const res = await apiFetch<ApiSuccessResponse<LocateResult>>("/api/addresses/locate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ latitude, longitude }),
          });
          result = res.data;
        } catch {
          // The pin still counts; only the lookup is lost. A 401 surfaces at save.
        }
        const address = result?.lookup === "filled" ? result.address : null;
        onLocated({
          latitude,
          longitude,
          line1: address?.line1 ?? null,
          area: address?.area ?? null,
          city: address?.city ?? null,
          region: address?.region ?? null,
          delivery_zone_id: result?.lookup === "filled" ? result.delivery_zone_id : null,
        });
        setPhase({ kind: "done", filled: !!address && Object.values(address).some(Boolean), accuracy });
      },
      (error) => setPhase({ kind: "error", message: geolocationMessage(error) }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }, []);

  const reset = useCallback(() => setPhase({ kind: "idle" }), []);
  return { phase, run, reset };
}

export function LocateMeButton({
  state,
  pinned,
  onLocate,
  onClear,
}: {
  state: LocateMeState;
  pinned: boolean;
  onLocate: () => void;
  onClear: () => void;
}) {
  const { phase } = state;
  const busy = phase.kind === "busy";

  if (pinned) {
    const filled = phase.kind === "done" && phase.filled;
    const accuracy = phase.kind === "done" ? phase.accuracy : null;
    return (
      <div className="flex items-start gap-3 rounded-2xl border-2 border-tm-coral bg-[#FFF8F5] p-3.5">
        <CheckCircle weight="fill" className="mt-0.5 size-[18px] shrink-0 text-tm-coral" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm leading-[1.2] font-semibold">
            Location pinned{accuracy != null ? ` · within about ${accuracy} m` : ""}
          </span>
          <span className="text-xs leading-[1.45] text-tm-text-2">
            {filled
              ? "We filled in what we could. Check it, and add a landmark so the courier finds the gate."
              : "The courier gets your exact pin. Add the street or a landmark below."}
          </span>
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-label="Remove the pinned location"
          className="rounded-full p-1 text-tm-text-3 transition-colors hover:text-tm-coral"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={onLocate}
        disabled={busy}
        aria-busy={busy}
        className={cn(
          "flex h-[46px] items-center justify-center gap-2 rounded-xl border border-tm-coral/40 bg-[#FFF8F5] text-sm leading-none font-bold text-tm-coral",
          "transition-colors hover:border-tm-coral disabled:cursor-wait disabled:opacity-60",
        )}
      >
        <Crosshair weight="bold" className="size-4" aria-hidden />
        {busy ? "Finding you…" : "Use my current location"}
      </button>
      {phase.kind === "error" ? (
        <p role="alert" className="text-xs leading-[1.45] font-medium text-tm-coral-strong">
          {phase.message}
        </p>
      ) : (
        <p className="text-xs leading-[1.45] text-tm-text-3">Or type it in below.</p>
      )}
    </div>
  );
}
