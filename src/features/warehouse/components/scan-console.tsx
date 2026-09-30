"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BoxIcon, CameraIcon, CameraOffIcon, CornerDownLeftIcon, KeyboardIcon, PackageIcon, SmartphoneIcon } from "lucide-react";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

import type { LookupResult } from "../types";
import { cameraHelp, cameraSupported, createFrameDecoder } from "./frame-decoder";
import { errorText, warehouseRequest } from "./warehouse-actions";

/**
 * Scan anything (081): the QR on our label, its Code 128, or an order's
 * TM-number.
 *
 * Three ways in, because the hub has three kinds of hands:
 *  - A handheld scanner. It is a keyboard: it types the code into the focused
 *    field and presses Enter. The field is focused on arrival and after every
 *    scan, so the operator just keeps pulling the trigger.
 *  - This phone's camera, in every browser that can open one — iPhone Safari
 *    included (see `frame-decoder.ts`). The browser asks the operator's
 *    permission the first time; if they refused, the page says exactly where to
 *    allow it and offers to try again. Frames never leave the device.
 *  - The phone's own camera app: the label's QR is a URL, so pointing any
 *    phone camera at it opens the package directly.
 */

interface RecentScan {
  code: string;
  label: string;
  href: string;
  kind: LookupResult["kind"];
  at: number;
}

const RECENT_KEY = "tm.warehouse.recent-scans";

function readRecent(): RecentScan[] {
  try {
    return JSON.parse(sessionStorage.getItem(RECENT_KEY) ?? "[]") as RecentScan[];
  } catch {
    return [];
  }
}

function writeRecent(list: RecentScan[]) {
  try {
    sessionStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
  } catch {
    /* private mode: recent scans are a convenience */
  }
}

export function ScanConsole() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [camera, setCamera] = useState<"off" | "starting" | "on" | "unsupported" | "denied">("off");
  const [help, setHelp] = useState<string[]>([]);
  const [recent, setRecent] = useState<RecentScan[]>([]);
  const [hit, setHit] = useState<string | null>(null);

  useEffect(() => {
    setRecent(readRecent());
    // Only a browser with no camera API at all (an in-app webview, plain http)
    // is "unsupported". Everything else gets the button, and the browser's own
    // permission prompt when it is pressed.
    if (!cameraSupported()) setCamera("unsupported");
    setHelp(cameraHelp(navigator.userAgent));
    inputRef.current?.focus();
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamera((c) => (c === "unsupported" ? c : "off"));
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const resolve = useCallback(
    async (raw: string) => {
      const value = raw.trim();
      if (!value || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      try {
        const result = await warehouseRequest<LookupResult>("/api/warehouse/lookup", "POST", { code: value });
        const href =
          result.kind === "package" ? `/warehouse/packages/${result.id}?scanned=1` : `/warehouse/items/${result.id}`;
        const label = result.kind === "package" ? result.reference : result.order_no;
        const next = [{ code: value, label, href, kind: result.kind, at: Date.now() }, ...readRecent().filter((r) => r.label !== label)];
        writeRecent(next);
        setHit(label);
        if (navigator.vibrate) navigator.vibrate(40);
        stopCamera();
        router.push(href);
      } catch (e) {
        setError(errorText(e));
        setCode("");
        inputRef.current?.focus();
        busyRef.current = false;
        setBusy(false);
      }
    },
    [router, stopCamera],
  );

  const startCamera = async () => {
    if (!cameraSupported()) {
      setCamera("unsupported");
      return;
    }
    setCamera("starting");
    let stream: MediaStream;
    try {
      // Asking is what raises the browser's "Allow camera?" prompt. It must run
      // straight from the tap — iOS refuses a prompt that is not a user gesture.
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      setCamera(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unsupported");
      return;
    }
    try {
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setCamera("on");
      const decode = await createFrameDecoder();
      let last = 0;
      const tick = async (now: number) => {
        if (!streamRef.current || busyRef.current) return;
        // ~8 decodes a second: fast enough to feel instant, light on a phone.
        if (now - last >= 120) {
          last = now;
          try {
            const value = await decode(video);
            if (value) {
              await resolve(value);
              return;
            }
          } catch {
            /* a frame that fails to decode is normal */
          }
        }
        requestAnimationFrame((t) => void tick(t));
      };
      requestAnimationFrame((t) => void tick(t));
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCamera("unsupported");
    }
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        {/* Viewfinder */}
        <div className="tm-up relative aspect-[4/3] overflow-hidden rounded-[26px] bg-tm-ink [animation-duration:0.5s] sm:aspect-[16/10]">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={cn("absolute inset-0 size-full object-cover transition-opacity", camera === "on" ? "opacity-100" : "opacity-0")}
          />
          {/* Frame */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative size-[58%] max-h-[260px] max-w-[260px]">
              {["top-0 left-0 border-t-4 border-l-4 rounded-tl-[18px]", "top-0 right-0 border-t-4 border-r-4 rounded-tr-[18px]", "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-[18px]", "right-0 bottom-0 border-r-4 border-b-4 rounded-br-[18px]"].map((c) => (
                <span key={c} className={cn("absolute size-10 border-[#ff8a5c]", c)} />
              ))}
              {camera === "on" || camera === "off" ? (
                <motion.span
                  className="absolute inset-x-3 h-[3px] rounded-full bg-[linear-gradient(90deg,transparent,#ff8a5c,transparent)] shadow-[0_0_18px_4px_rgba(255,138,92,.55)]"
                  animate={{ top: ["8%", "92%", "8%"] }}
                  transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                />
              ) : null}
            </div>
          </div>

          {camera !== "on" ? (
            <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-gradient-to-t from-black/70 to-transparent px-6 pt-16 pb-6 text-center">
              {camera === "unsupported" ? (
                <>
                  <SmartphoneIcon className="size-6 text-white/80" aria-hidden />
                  <p className="max-w-[40ch] text-[13px] font-medium text-white/85">
                    This browser cannot open the camera. Open this page in Safari or Chrome, or point your phone&apos;s <b>Camera</b> app at the label&apos;s QR: it opens the package here. A handheld scanner works below too.
                  </p>
                </>
              ) : camera === "denied" ? (
                <>
                  <CameraOffIcon className="size-6 text-white/80" aria-hidden />
                  <p className="max-w-[40ch] text-[13px] font-semibold text-white">Camera access is turned off for this site.</p>
                  <ol className="max-w-[42ch] list-decimal space-y-0.5 pl-5 text-left text-[12.5px] font-medium text-white/85">
                    {help.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  <button
                    type="button"
                    onClick={startCamera}
                    className="mt-1 inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-[13px] font-semibold text-tm-ink"
                  >
                    <CameraIcon className="size-4" aria-hidden />
                    Try again
                  </button>
                </>
              ) : (
                <>
                <button
                  type="button"
                  onClick={startCamera}
                  disabled={camera === "starting"}
                  className="tm-cta-gradient inline-flex h-11 items-center gap-2 rounded-full px-6 text-[14px] font-semibold text-white shadow-[0_14px_30px_-12px_rgba(244,63,94,0.7)]"
                >
                  {camera === "starting" ? <Spinner className="size-4" /> : <CameraIcon className="size-4" aria-hidden />}
                  Scan with camera
                </button>
                <p className="text-[12px] font-medium text-white/70">Your browser will ask to use the camera. Tap Allow.</p>
                </>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={stopCamera}
              className="absolute top-4 right-4 inline-flex h-9 items-center gap-1.5 rounded-full bg-black/50 px-3.5 text-[12.5px] font-semibold text-white backdrop-blur"
            >
              <CameraOffIcon className="size-4" aria-hidden />
              Stop
            </button>
          )}

          <AnimatePresence>
            {hit ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-tm-green/90 text-white"
              >
                <BoxIcon className="size-10" aria-hidden />
                <span className="font-mono text-[24px] font-bold">{hit}</span>
                <span className="text-[13px] font-semibold">Opening…</span>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Keyboard / handheld scanner */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void resolve(code);
          }}
          className="tm-up flex flex-col gap-2 [animation-duration:0.5s] [animation-delay:.06s]"
        >
          <label htmlFor="scan-code" className="flex items-center gap-2 text-[13px] font-semibold text-tm-ink">
            <KeyboardIcon className="size-4 text-tm-text-3" aria-hidden />
            Handheld scanner or type it
          </label>
          <div className="relative flex items-center">
            <input
              id="scan-code"
              ref={inputRef}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setError(null);
              }}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="PKG-10042 or TM-00042"
              className={cn(
                "h-14 w-full rounded-[18px] border bg-card pr-14 pl-5 font-mono text-[20px] font-bold tracking-wide text-tm-ink uppercase outline-none placeholder:font-sans placeholder:text-[15px] placeholder:font-medium placeholder:tracking-normal placeholder:text-tm-text-3 placeholder:normal-case focus:ring-4",
                error ? "border-tm-coral focus:ring-tm-coral/15" : "border-tm-border focus:border-tm-coral/60 focus:ring-tm-coral/10",
              )}
            />
            <button
              type="submit"
              disabled={busy || !code.trim()}
              className="absolute right-2 flex size-10 items-center justify-center rounded-[12px] bg-tm-ink text-white disabled:opacity-40"
              aria-label="Look it up"
            >
              {busy ? <Spinner className="size-4" /> : <CornerDownLeftIcon className="size-4" />}
            </button>
          </div>
          {error ? <p className="text-[13px] font-semibold text-tm-coral-strong">{error}</p> : null}
        </form>
      </div>

      <aside className="tm-up flex flex-col gap-3 [animation-duration:0.5s] [animation-delay:.1s]">
        <h2 className="font-display text-[17px] leading-none font-bold text-tm-ink">Recent scans</h2>
        {recent.length === 0 ? (
          <p className="rounded-[18px] border border-dashed border-tm-border bg-card px-4 py-6 text-[13px] font-medium text-tm-text-3">
            Nothing scanned yet on this device.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-tm-hairline overflow-hidden rounded-[18px] border border-tm-border bg-card">
            {recent.map((r) => (
              <li key={r.label}>
                <button
                  type="button"
                  onClick={() => router.push(r.href)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-tm-paper/70"
                >
                  <span className="flex size-9 items-center justify-center rounded-[11px] bg-tm-paper text-tm-text-2">
                    {r.kind === "package" ? <BoxIcon className="size-4" /> : <PackageIcon className="size-4" />}
                  </span>
                  <span className="flex flex-col">
                    <span className="font-mono text-[14px] font-bold text-tm-ink">{r.label}</span>
                    <span className="text-[12px] font-medium text-tm-text-3">
                      {r.kind === "package" ? "Package" : "Item"} ·{" "}
                      {new Date(r.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
