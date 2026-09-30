/**
 * Walkthrough clips of the real warehouse (081 guide), filmed against the local
 * stack with headless Chrome and encoded to H.264. The cue text is the same as
 * each clip's `.vtt`, so the on-page caption, the transcript and the native
 * captions track all say one thing.
 */

export type ClipDevice = "phone" | "laptop";

export interface ClipCue {
  from: number;
  to: number;
  text: string;
}

export interface GuideClip {
  id: string;
  title: string;
  device: ClipDevice;
  /** The address the fake browser bar shows. */
  path: string;
  width: number;
  height: number;
  duration: number;
  cues: ClipCue[];
}

const BASE = "/videos/warehouse-guide";

export function clipSources(clip: GuideClip, base = BASE) {
  return {
    mp4: `${base}/${clip.id}.mp4`,
    poster: `${base}/${clip.id}.webp`,
    captions: `${base}/${clip.id}.vtt`,
  };
}

const PHONE = { device: "phone" as const, width: 702, height: 1520 };
const LAPTOP = { device: "laptop" as const, width: 1536, height: 960 };

export const CLIPS = {
  receive: {
    id: "receive-log-in",
    title: "Logging a parcel in",
    path: "/warehouse/receive",
    duration: 12.1,
    ...PHONE,
    cues: [
      { from: 0.45, to: 3.46, text: "Expected: paid orders on their way to the hub." },
      { from: 3.46, to: 5.97, text: "The weight box is ready for the scale reading." },
      { from: 5.97, to: 12.08, text: "Log it in. The customer's tracking now shows it at the hub." },
    ],
  },
  photos: {
    id: "item-photos",
    title: "Photos and holds on the item page",
    path: "/warehouse/items/…",
    duration: 16.4,
    ...PHONE,
    cues: [
      { from: 0.44, to: 2.24, text: "Each parcel has its own page: what it is, who it is for." },
      { from: 2.24, to: 8.8, text: "Photos: take one with the phone. The customer sees it and can reply." },
      { from: 8.8, to: 16.42, text: "Hold stops a parcel from being packed or sealed until it is released." },
    ],
  },
  pack: {
    id: "pack-items",
    title: "Selecting and packing",
    path: "/warehouse/receive?stage=received",
    duration: 14.7,
    ...LAPTOP,
    cues: [
      { from: 0.45, to: 1.85, text: "On the shelf: logged in, grouped by customer." },
      { from: 1.85, to: 7.41, text: "Tick one customer's items. The tray counts them." },
      { from: 7.41, to: 14.71, text: "New package puts them in a fresh box on the bench." },
    ],
  },
  seal: {
    id: "seal-package",
    title: "Weighing and sealing a package",
    path: "/warehouse/packages/…",
    duration: 18.4,
    ...LAPTOP,
    cues: [
      { from: 0.48, to: 8.8, text: "Put the box on the scale and type its weight." },
      { from: 8.8, to: 14.8, text: "Seal it. The flaps close and the contents are frozen." },
      { from: 14.8, to: 18.38, text: "Next: print the label, then mark it shipped." },
    ],
  },
  peek: {
    id: "package-peek",
    title: "Opening the box from the grid",
    path: "/warehouse/packages",
    duration: 13.1,
    ...LAPTOP,
    cues: [
      { from: 0.41, to: 7.68, text: "Packages: every box on the bench. Tap one to look inside." },
      { from: 7.68, to: 13.13, text: "The contents, without losing your place. Open package to edit." },
    ],
  },
  label: {
    id: "label-sizes",
    title: "The label page",
    path: "/warehouse/packages/…/label",
    duration: 20.3,
    ...LAPTOP,
    cues: [
      { from: 0.3, to: 5, text: "The label page shows the label at its real size. Pick the paper you have." },
      { from: 5, to: 11.58, text: "4×6, 80 mm roll, 2×1 or manifest: the page tells the printer the paper size." },
      { from: 11.58, to: 20.3, text: "Print counts every copy. Printing tips live at the bottom of the page." },
    ],
  },
  ship: {
    id: "ship-dialog",
    title: "The ship dialog",
    path: "/warehouse/packages/…",
    duration: 14.5,
    ...LAPTOP,
    cues: [
      { from: 0.46, to: 4.63, text: "Mark shipped when the box leaves with the carrier." },
      { from: 4.63, to: 10.39, text: "Add the carrier and waybill. Every customer is notified. There is no undo here." },
      { from: 10.39, to: 14.46, text: "Not ready? Not yet closes it without changing anything." },
    ],
  },
  scan: {
    id: "scan-typing",
    title: "Scanning by typing a code",
    path: "/warehouse/scan",
    duration: 11.3,
    ...PHONE,
    cues: [
      { from: 0.45, to: 4.2, text: "Scan: camera, handheld scanner, or type the code." },
      { from: 4.2, to: 6.32, text: "Type the number on the label or the order. Case and the dash do not matter." },
      { from: 6.32, to: 11.29, text: "Enter opens it: an order opens its item page, a package opens the package." },
    ],
  },
} satisfies Record<string, GuideClip>;

export type ClipKey = keyof typeof CLIPS;

export function cueAt(clip: GuideClip, time: number): ClipCue | null {
  return clip.cues.find((cue) => time >= cue.from && time < cue.to) ?? null;
}
