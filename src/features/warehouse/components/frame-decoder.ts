/**
 * Reads a code out of a live camera frame (081), whatever the browser.
 *
 * Chrome on Android and desktop ship `BarcodeDetector`, which reads both our
 * QR and the Code 128. iOS Safari does not — and it is what most of the hub's
 * phones run — so there the frame is drawn to a canvas and decoded by jsQR, a
 * dependency-free QR decoder that is only downloaded when it is needed. The
 * label's QR is the code a phone camera is pointed at; the Code 128 is for the
 * handheld scanners, which type into the field instead.
 *
 * Frames never leave the device.
 */

type Detector = { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };
type DetectorCtor = new (options: { formats: string[] }) => Detector;

export type FrameDecoder = (video: HTMLVideoElement) => Promise<string | null>;

/** Longest side a frame is decoded at: enough for a label at arm's length, cheap on a phone. */
const MAX_SIDE = 720;

export function cameraSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

export async function createFrameDecoder(): Promise<FrameDecoder> {
  const Native = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (Native) {
    try {
      const detector = new Native({ formats: ["qr_code", "code_128"] });
      return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
    } catch {
      /* some builds expose the constructor but reject the formats — fall through */
    }
  }

  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser cannot read camera frames.");

  return async (video) => {
    const { videoWidth: w, videoHeight: h } = video;
    if (!w || !h) return null;
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = context.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(frame.data, frame.width, frame.height, { inversionAttempts: "dontInvert" })?.data ?? null;
  };
}

/** Where to go to allow the camera again, in the words of the browser in hand. */
export function cameraHelp(userAgent: string): string[] {
  const ios = /iPhone|iPad|iPod/i.test(userAgent);
  const android = /Android/i.test(userAgent);
  const chrome = /CriOS|Chrome/i.test(userAgent) && !/Edg/i.test(userAgent);
  if (ios && !/CriOS|FxiOS|EdgiOS/i.test(userAgent)) {
    return [
      "Tap aA in the address bar, then Website Settings.",
      "Set Camera to Allow, then tap Try again.",
      "Still blocked? iPhone Settings → Apps → Safari → Camera → Allow.",
    ];
  }
  if (ios) {
    return ["iPhone Settings → Apps → your browser → turn Camera on.", "Come back and tap Try again."];
  }
  if (android || chrome) {
    return [
      "Tap the icon to the left of the address, then Permissions (or Site settings).",
      "Set Camera to Allow, then tap Try again.",
    ];
  }
  return ["Open this site's settings from the address bar, allow the Camera, then tap Try again."];
}
