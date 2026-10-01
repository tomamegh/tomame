"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BoxIcon, CameraIcon, CircleHelpIcon, KeyboardIcon, PackageIcon, QrCodeIcon, ScanBarcodeIcon, ShieldCheckIcon } from "lucide-react";

import { cameraHelp } from "@/features/warehouse/components/frame-decoder";
import { cn } from "@/lib/utils";

import { explainCode } from "../codes";
import { CAMERA_USER_AGENTS, CODE_EXAMPLES, SCAN_WAYS } from "../content";
import { GuideVideo } from "./guide-video";

/**
 * Scanning (081 guide): the four ways in, a box that shows how any code will
 * be read, and — the thing new staff get stuck on — how to allow the camera
 * after saying no. The allow-steps come from `cameraHelp`, the same function
 * the Scan screen shows, so the guide and the app cannot disagree.
 */

const WAY_ICONS = { handheld: ScanBarcodeIcon, camera: CameraIcon, "camera-app": QrCodeIcon, typing: KeyboardIcon } as const;

const PLATFORMS = [
  { id: "iphone", label: "iPhone · Safari", ua: CAMERA_USER_AGENTS.iphone },
  { id: "iphoneOther", label: "iPhone · Chrome", ua: CAMERA_USER_AGENTS.iphoneOther },
  { id: "android", label: "Android · Chrome", ua: CAMERA_USER_AGENTS.android },
  { id: "computer", label: "Computer · Chrome or Edge", ua: CAMERA_USER_AGENTS.computer },
] as const;

export function ScanningGuide() {
  return (
    <div className="flex min-w-0 flex-col gap-8">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
        {SCAN_WAYS.map((way) => {
          const Icon = WAY_ICONS[way.id as keyof typeof WAY_ICONS];
          return (
            <div key={way.id} className="flex min-w-0 flex-col gap-2.5 rounded-[20px] border border-tm-border bg-card p-5">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-[12px] bg-tm-paper text-tm-ink">
                  <Icon className="size-[18px]" aria-hidden />
                </span>
                <h3 className="font-display text-[16px] font-bold text-tm-ink">{way.title}</h3>
              </div>
              <p className="text-[13.5px] leading-[1.55] font-medium text-tm-text-2">{way.body}</p>
              <p className="mt-auto text-[12px] font-semibold text-tm-text-3">Reads: {way.reads}</p>
            </div>
          );
        })}
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          <CodeTester />
          <CameraPermission />
        </div>
        <GuideVideo clip="scan" />
      </div>
    </div>
  );
}

function CodeTester() {
  const [value, setValue] = useState("");
  const result = explainCode(value);
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-[22px] border border-tm-border bg-card p-5">
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-[17px] font-bold text-tm-ink">Try a code</h3>
        <p className="text-[13px] leading-[1.5] font-medium text-tm-text-2">Type anything a scanner might send. This box reads it exactly as the Scan screen does, without looking anything up.</p>
      </div>
      <label htmlFor="guide-code" className="sr-only">
        A code to read
      </label>
      <input
        id="guide-code"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="e.g. pkg 10042, tm-42"
        className="h-12 w-full min-w-0 rounded-[16px] border border-tm-border bg-card px-4 font-mono text-[17px] font-bold tracking-wide text-tm-ink outline-none placeholder:font-sans placeholder:text-[14px] placeholder:font-medium placeholder:tracking-normal placeholder:text-tm-text-3 focus:border-tm-coral/60 focus:ring-4 focus:ring-tm-coral/10"
      />
      <div className="flex flex-wrap gap-1.5">
        {CODE_EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => setValue(ex)}
            className="max-w-full truncate rounded-full border border-tm-border bg-tm-paper px-2.5 py-1 font-mono text-[11.5px] font-semibold text-tm-text-2 transition-colors hover:border-tm-coral/40 hover:text-tm-ink"
          >
            {ex}
          </button>
        ))}
      </div>
      <div aria-live="polite" className="min-h-[56px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={result.kind === "empty" ? "empty" : result.code}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className={cn(
              "flex items-center gap-3 rounded-[16px] px-4 py-3",
              result.kind === "package" && "bg-tm-green-bg text-tm-green-ink",
              result.kind === "order" && "bg-tm-tint text-tm-ink",
              result.kind === "carrier" && "bg-tm-tint text-tm-ink",
              result.kind === "unknown" && "bg-tm-amber-bg text-[#7a4a06]",
              result.kind === "empty" && "bg-tm-paper text-tm-text-3",
            )}
          >
            {result.kind === "package" ? <BoxIcon className="size-5 shrink-0" aria-hidden /> : result.kind === "order" ? <PackageIcon className="size-5 shrink-0" aria-hidden /> : <CircleHelpIcon className="size-5 shrink-0" aria-hidden />}
            <span className="min-w-0 text-[13.5px] leading-[1.45] font-medium">
              {result.kind === "empty" ? (
                "The reading appears here."
              ) : result.kind === "package" ? (
                <>
                  Package <b className="font-mono">{result.code}</b>: opens the package page.
                </>
              ) : result.kind === "order" ? (
                <>
                  Order <b className="font-mono">{result.code}</b>: opens the item page, where you log it in.
                </>
              ) : result.kind === "carrier" ? (
                <>
                  {result.carrier} <b className="font-mono break-all">{result.code}</b>: opens the store parcel and its order, or asks which order it is.
                </>
              ) : (
                <>
                  <b className="font-mono break-all">{result.code}</b> is not a Tomame package or order. Probably a store barcode.
                </>
              )}
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function CameraPermission() {
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]["id"]>("iphone");
  const current = PLATFORMS.find((p) => p.id === platform)!;
  const steps = cameraHelp(current.ua);
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-[22px] border border-tm-border bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-tm-tint text-tm-coral-strong">
          <ShieldCheckIcon className="size-[18px]" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="font-display text-[17px] font-bold text-tm-ink">Allowing the camera</h3>
          <p className="text-[13px] leading-[1.5] font-medium text-tm-text-2">
            The first time you press <b>Scan with camera</b>, the browser asks. Tap <b>Allow</b>. If you tapped no, the Scan screen says
            “Camera access is turned off for this site” and shows these steps, with a <b>Try again</b> button.
          </p>
        </div>
      </div>
      <div role="tablist" aria-label="Your phone or computer" className="flex flex-wrap gap-1.5">
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={p.id === platform}
            onClick={() => setPlatform(p.id)}
            className={cn(
              "inline-flex h-8 items-center rounded-full border px-3 text-[12.5px] font-semibold transition-colors focus-visible:ring-4 focus-visible:ring-tm-coral/25 focus-visible:outline-none",
              p.id === platform ? "border-tm-ink bg-tm-ink text-white" : "border-tm-border bg-card text-tm-text-2 hover:text-tm-ink",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <ol role="tabpanel" aria-label={current.label} className="flex flex-col gap-2 rounded-[16px] bg-tm-ink p-4 text-white">
        {steps.map((step, i) => (
          <li key={step} className="flex gap-3 text-[13.5px] leading-[1.5] font-medium text-white/90">
            <span className="tm-nums flex size-6 shrink-0 items-center justify-center rounded-full bg-white/12 text-[12px] font-bold">{i + 1}</span>
            <span className="min-w-0">{step}</span>
          </li>
        ))}
      </ol>
      <p className="text-[12.5px] leading-[1.5] font-medium text-tm-text-3">
        Camera still will not open? Type the code, or use the handheld scanner. Both work everywhere.
      </p>
    </div>
  );
}
