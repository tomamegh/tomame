import {
  BookOpenIcon,
  BoxesIcon,
  CameraIcon,
  CircleHelpIcon,
  ClipboardCheckIcon,
  GamepadIcon,
  InboxIcon,
  LayersIcon,
  LockIcon,
  MessageSquareWarningIcon,
  MonitorSmartphoneIcon,
  PlaneTakeoffIcon,
  PrinterIcon,
  RouteIcon,
  ScanLineIcon,
  SparklesIcon,
  Undo2Icon,
  type LucideIcon,
} from "lucide-react";

import type { QuizQuestion } from "./quiz";
import type { Searchable } from "./search";
import type { ClipKey } from "./videos";

/**
 * Everything the operator guide says (081), in one place so it can be checked
 * against the app in one read. Each fact here is taken from the component that
 * does the thing — button labels, limits and messages are quoted, not recalled.
 */

// ── Sections ────────────────────────────────────────────────────────────────

export interface GuideSection {
  id: string;
  label: string;
  icon: LucideIcon;
  minutes: number;
}

export const SECTIONS: GuideSection[] = [
  { id: "first-day", label: "Your first day", icon: SparklesIcon, minutes: 2 },
  { id: "daily-flow", label: "The daily flow", icon: RouteIcon, minutes: 3 },
  { id: "screens", label: "Every screen", icon: MonitorSmartphoneIcon, minutes: 3 },
  { id: "printing", label: "Printing labels", icon: PrinterIcon, minutes: 2 },
  { id: "scanning", label: "Scanning", icon: ScanLineIcon, minutes: 2 },
  { id: "holds", label: "Holds & customer issues", icon: MessageSquareWarningIcon, minutes: 2 },
  { id: "consolidated", label: "Consolidated cartons", icon: LayersIcon, minutes: 1 },
  { id: "mistakes", label: "Mistakes & undo", icon: Undo2Icon, minutes: 2 },
  { id: "practice", label: "Practice run", icon: GamepadIcon, minutes: 3 },
  { id: "ready", label: "Ready for your first shift", icon: ClipboardCheckIcon, minutes: 2 },
  { id: "faq", label: "FAQ", icon: CircleHelpIcon, minutes: 1 },
  { id: "glossary", label: "Glossary", icon: BookOpenIcon, minutes: 1 },
];

export const SECTION_IDS = SECTIONS.map((s) => s.id);

export const TOTAL_MINUTES = SECTIONS.reduce((sum, s) => sum + s.minutes, 0);

// ── Your first day ──────────────────────────────────────────────────────────

export const ROLES = [
  {
    id: "operator",
    name: "Warehouse operator",
    badge: "Your role",
    summary: "The packaging platform and nothing else. Sign in and you land on Overview.",
    can: [
      "Log parcels in and weigh them",
      "Photograph parcels for the customer",
      "Pack, seal, label and ship boxes",
      "Answer customer replies and put parcels on hold",
      "Scan any Tomame label or order number",
    ],
    cannot: [
      "Open the admin console or the customer shop (both send you back here)",
      "See prices, payments, or a customer's email",
      "Change an order's status by hand",
    ],
  },
  {
    id: "admin",
    name: "Admin",
    badge: "Your manager",
    summary: "Everything you have, plus the admin console, linked from the account menu.",
    can: [
      "Everything a warehouse operator can do",
      "Create warehouse accounts and change roles: Users → Add a user → Warehouse operator",
      "Talk to the customer when something cannot be undone, like a box shipped too early",
    ],
    cannot: [],
  },
] as const;

export const YOU_SEE = [
  { label: "The item", detail: "Name, picture, store, quantity and its listed weight" },
  { label: "Who it is for", detail: "Name, delivery address or pickup point, and phone, for the label" },
  { label: "Where it is", detail: "Expected, On the shelf, Packed or Shipped, and which box" },
  { label: "What they said", detail: "Customer instructions and their replies to your photos" },
];

export const GOLDEN_RULES = [
  { title: "Log it in before it goes on the shelf", body: "Weigh it as you log it. The customer's tracking starts moving the moment you press Log it in." },
  { title: "One customer, one box", body: "Unless you mean to make a consolidated carton. The Add items window warns you when you mix." },
  { title: "Sealed means frozen", body: "To change what is inside a sealed box, Reopen it, change it, seal it again and reprint the label." },
  { title: "Shipping is final", body: "Mark shipped moves every order to in transit and notifies each customer. Order statuses only move forward, so it cannot be undone." },
];

// ── The daily flow ──────────────────────────────────────────────────────────

export interface FlowStep {
  id: string;
  title: string;
  verb: string;
  icon: LucideIcon;
  where: { href: string; label: string };
  doing: string[];
  customer: string;
  rule: string;
  clip: ClipKey;
}

export const FLOW: FlowStep[] = [
  {
    id: "receive",
    title: "Receive",
    verb: "Log it in",
    icon: InboxIcon,
    where: { href: "/warehouse/receive", label: "Receive" },
    doing: [
      "Scan or type the parcel's TM-number into the search box and press Enter. The log-in window opens by itself.",
      "Check it matches the listing, put it on the scale and type the weight in pounds. The weight box is already focused.",
      "Press Log it in (or Enter). It moves from Expected to On the shelf.",
    ],
    customer: "Their tracking shows “Arrived at our US hub”, with the weight you typed.",
    rule: "Weight is optional in the app, but it is what the box is charged on. If you skip it, use Re-weigh later.",
    clip: "receive",
  },
  {
    id: "photograph",
    title: "Photograph",
    verb: "Show the customer",
    icon: CameraIcon,
    where: { href: "/warehouse/receive?stage=received", label: "the item page" },
    doing: [
      "Open the item (tap its name anywhere) and go to Photos.",
      "On a phone, Take a photo opens the camera. On a computer, Choose photos. Up to ten at a time.",
      "Pick what it shows (“Arrived at our US hub” is the usual one), add a note if the photo needs words, and Send.",
    ],
    customer: "One email for the batch, and the photo on their journey screen, where they answer “Looks right” or tell us what is wrong.",
    rule: "Photograph before you pack. It is the last moment a wrong item is cheap to fix. Untick “Show this to the customer” to keep a photo internal.",
    clip: "photos",
  },
  {
    id: "pack",
    title: "Pack",
    verb: "Box it by customer",
    icon: BoxesIcon,
    where: { href: "/warehouse/receive?stage=received", label: "Receive → On the shelf" },
    doing: [
      "Tick one customer's items. The box beside their name ticks all of them.",
      "New package starts a box. Add to open puts them in a box already on the bench.",
      "Or, from a package, Add items: tick from the shelf, scan a TM-number, or describe something by hand.",
    ],
    customer: "Nothing yet. Packing is internal.",
    rule: "Held items cannot be ticked. Mixing two customers makes a consolidated carton, so do it on purpose.",
    clip: "pack",
  },
  {
    id: "seal",
    title: "Seal",
    verb: "Weigh and close",
    icon: LockIcon,
    where: { href: "/warehouse/packages?status=packing", label: "the package page" },
    doing: [
      "Weigh the packed box and type its weight in Details. Add the size, Air or Sea, and any handling marks, then Save details.",
      "Press Seal package. On screen the flaps close and the tape runs down the seam.",
    ],
    customer: "Nothing yet.",
    rule: "Sealing freezes the contents. An empty box, or one with a held item in it, will not seal.",
    clip: "seal",
  },
  {
    id: "label",
    title: "Label",
    verb: "Print and stick",
    icon: PrinterIcon,
    where: { href: "/warehouse/packages?status=sealed", label: "Print label" },
    doing: [
      "On the sealed package, press Print label. Choose the tab that matches the paper in the printer.",
      "Set copies on the page, press Print, and check the dialog: your label printer, margins None, scale 100%.",
      "Stick the 4×6 flat on the top of the box.",
    ],
    customer: "Nothing yet.",
    rule: "Print from Chrome or Edge on the computer the printer is plugged into. Every press of Print is counted.",
    clip: "label",
  },
  {
    id: "ship",
    title: "Ship",
    verb: "Hand it over",
    icon: PlaneTakeoffIcon,
    where: { href: "/warehouse/packages?status=sealed", label: "Mark shipped" },
    doing: [
      "When the box leaves with the carrier, open it and press Mark shipped.",
      "Type the carrier and the waybill or tracking number. Customers see both.",
      "Press Ship it.",
    ],
    customer: "Every order in the box moves to in transit, and each customer gets their shipping update with the carrier and waybill.",
    rule: "This cannot be undone from any screen: order statuses only move forward. Not sure? Press Not yet.",
    clip: "ship",
  },
];

// ── Every screen ────────────────────────────────────────────────────────────

export interface ScreenInfo {
  id: string;
  name: string;
  href: string;
  path: string;
  purpose: string;
  points: string[];
  tip: string;
  clip?: ClipKey;
}

export const SCREENS: ScreenInfo[] = [
  {
    id: "overview",
    name: "Overview",
    href: "/warehouse",
    path: "/warehouse",
    purpose: "The hub at a glance, laid out the way parcels move through the building.",
    points: [
      "Five counts across the top: Expected, On the shelf, Packing, Sealed, and Shipped in the last 7 days. Each opens the screen where that work is done.",
      "An amber bar appears when customer issues are open or items are on hold. Check it before you seal anything.",
      "On the bench lists every open and sealed box. Ready to pack groups shelf items by customer, each with a one-tap Pack.",
      "Recently shipped shows what left this week, with its waybill.",
    ],
    tip: "Start every shift here. If the amber bar is showing, go to Issues first.",
  },
  {
    id: "receive",
    name: "Receive",
    href: "/warehouse/receive",
    path: "/warehouse/receive",
    purpose: "Inbound: log parcels in, weigh them, and pick what goes in a box.",
    points: [
      "Filters: Everything, Expected, On the shelf, Packed, each with a count.",
      "The search box is also a scanner input. Scan a TM-number and press Enter: an expected or shelf parcel opens its log-in window, a packed one opens its page.",
      "Rows are grouped by customer. Expected rows have Log in; shelf rows have a scale button to re-weigh.",
      "Tick rows and a dark tray rises from the bottom: New package, or Add to open when a box is already on the bench.",
    ],
    tip: "Keep the cursor in the search box and keep scanning: it clears itself after each hit.",
    clip: "receive",
  },
  {
    id: "item",
    name: "Item page",
    href: "/warehouse/receive?stage=received",
    path: "/warehouse/items/…",
    purpose: "One parcel: what it is, who it is for, and what the customer has said about it.",
    points: [
      "Buttons change with the stage: Log it in, Pack it, Re-weigh, Photos, Open PKG-…, and Hold or Release hold.",
      "Photos: send pictures to the customer and read their replies underneath.",
      "Deliver to: the address or pickup point and a tap-to-call phone number.",
      "Customer instructions, when there are any, sit in an amber card. Read them before you pack.",
    ],
    tip: "A green dot on a thumbnail anywhere in the app means it is your hub photo, not the store's picture.",
    clip: "photos",
  },
  {
    id: "packages",
    name: "Packages",
    href: "/warehouse/packages",
    path: "/warehouse/packages",
    purpose: "Every box, by where it is in its life.",
    points: [
      "Tabs: On the bench (packing and sealed), Packing, Sealed, Shipped.",
      "The drawing tells you the state before you read a word: flaps up is packing, coral tape is sealed, a green stamp is shipped.",
      "Tap a card and the box opens in place to show what is inside. Label and Open package are one more tap.",
      "New package starts an empty box you can scan items into.",
    ],
    tip: "“What is in this one?” is answered by the peek. You do not lose your place on the grid.",
    clip: "peek",
  },
  {
    id: "package",
    name: "Package page",
    href: "/warehouse/packages",
    path: "/warehouse/packages/…",
    purpose: "One box, end to end. The biggest button is always the next step.",
    points: [
      "Next step, in order: Add items → Seal package → Print label → Mark shipped. Reopen sits beside them once sealed.",
      "A strip underneath shows Packed, Sealed and Shipped, with when and by whom.",
      "Inside lists every line. While packing, the × on a line takes it out and back to the shelf.",
      "Details: weight, size, Air or Sea, from and to, carrier, waybill, handling marks, and notes for the team (never printed).",
    ],
    tip: "Changed the details after printing? The app reminds you to reprint so the label matches.",
    clip: "seal",
  },
  {
    id: "label",
    name: "Label page",
    href: "/warehouse/packages?status=sealed",
    path: "/warehouse/packages/…/label",
    purpose: "The print surface. No menus, so what you see is what comes out.",
    points: [
      "Size tabs: Shipping 4×6″, Receipt roll 80 mm, Small 2×1″, Manifest.",
      "Copies: set them here with − and +, not in the print dialog. Small labels start at two.",
      "An amber warning shows if the box is still open: seal it first so the label cannot fall out of date.",
      "Printing tips are folded at the bottom of the page.",
    ],
    tip: "The arrow and package number at top left take you back to the box.",
    clip: "label",
  },
  {
    id: "scan",
    name: "Scan",
    href: "/warehouse/scan",
    path: "/warehouse/scan",
    purpose: "Look anything up: our label's QR or barcode, or an order's TM-number.",
    points: [
      "Scan with camera uses this phone or laptop's camera. Frames never leave the device.",
      "The field below takes a handheld scanner or your typing. It is focused when you arrive and after every scan.",
      "A package opens its page; an order opens its item page.",
      "Recent scans remembers the last few on this device.",
    ],
    tip: "On a phone, the round coral button in the middle of the bottom bar is always Scan.",
    clip: "scan",
  },
  {
    id: "issues",
    name: "Issues",
    href: "/warehouse/issues",
    path: "/warehouse/issues",
    purpose: "What customers said about your photos, worked while the parcel is still here.",
    points: [
      "Tabs: Waiting, Being looked at, Sorted, Dismissed.",
      "Each card shows the photo they replied to, their words, and the item. Tap the item to open it.",
      "Write what you did in the box (the customer reads it), then press I'm on it, Sorted, or Nothing in it.",
      "Hold parcel stops it being packed or sealed. Release parcel lets it move again.",
    ],
    tip: "Customers who said “Looks right” are folded at the bottom. File them with Noted, file it.",
  },
];

// ── Printing ────────────────────────────────────────────────────────────────

export type LabelSize = "4x6" | "roll80" | "2x1" | "manifest";

export const LABEL_SIZES: Array<{
  id: LabelSize;
  tab: string;
  printer: string;
  paper: string;
  use: string;
  copies: number;
  /** Width ÷ height, for the little drawing. */
  ratio: number;
}> = [
  { id: "4x6", tab: "Shipping 4×6″", printer: "Thermal label printer", paper: "4 × 6 in label", use: "The shipping label. Goes flat on top of the box.", copies: 1, ratio: 4 / 6 },
  { id: "roll80", tab: "Receipt roll 80 mm", printer: "Receipt printer", paper: "80 mm roll", use: "The same label on an 80 mm receipt roll, when there is no 4×6 printer.", copies: 1, ratio: 80 / 148 },
  { id: "2x1", tab: "Small 2×1″", printer: "Thermal label printer", paper: "2 × 1 in label", use: "A small tag for the side of the box, or a parcel inside it.", copies: 2, ratio: 2 },
  { id: "manifest", tab: "Manifest", printer: "Thermal label printer", paper: "4 × 6 in label", use: "The contents list, for the clear sleeve. Always print one for a consolidated carton.", copies: 1, ratio: 4 / 6 },
];

export interface DialogSetting {
  id: string;
  label: string;
  options: Array<{ value: string; text: string }>;
  /** Right answer, per size where it differs. */
  correct: (size: LabelSize) => string;
  why: string;
}

export const PRINT_DIALOG: DialogSetting[] = [
  {
    id: "browser",
    label: "Printing from",
    options: [
      { value: "chrome", text: "Chrome or Edge on the printer's computer" },
      { value: "safari", text: "Safari" },
      { value: "phone", text: "A phone" },
    ],
    correct: () => "chrome",
    why: "Safari and phones ignore the paper size and shrink the label.",
  },
  {
    id: "destination",
    label: "Destination",
    options: [
      { value: "pdf", text: "Save as PDF" },
      { value: "office", text: "Office printer" },
      { value: "thermal", text: "Thermal label printer" },
      { value: "receipt", text: "Receipt printer (80 mm)" },
    ],
    correct: (size) => (size === "roll80" ? "receipt" : "thermal"),
    why: "The label or receipt printer, never the office printer or a PDF.",
  },
  {
    id: "paper",
    label: "Paper size",
    options: [
      { value: "letter", text: "Letter" },
      { value: "4x6", text: "4 × 6 in label" },
      { value: "80mm", text: "80 mm roll" },
      { value: "2x1", text: "2 × 1 in label" },
    ],
    correct: (size) => (size === "roll80" ? "80mm" : size === "2x1" ? "2x1" : "4x6"),
    why: "It must match the tab you chose. The manifest prints on a 4 × 6 label.",
  },
  {
    id: "margins",
    label: "Margins",
    options: [
      { value: "default", text: "Default" },
      { value: "none", text: "None" },
      { value: "minimum", text: "Minimum" },
    ],
    correct: () => "none",
    why: "The label is drawn edge to edge. Any margin pushes the barcode off the paper.",
  },
  {
    id: "scale",
    label: "Scale",
    options: [
      { value: "fit", text: "Fit to page width" },
      { value: "100", text: "Default (100%)" },
      { value: "custom", text: "Custom 85%" },
    ],
    correct: () => "100",
    why: "Anything but 100% resizes the barcode, and scanners are fussy about bar widths.",
  },
  {
    id: "headers",
    label: "Headers and footers",
    options: [
      { value: "on", text: "Ticked" },
      { value: "off", text: "Unticked" },
    ],
    correct: () => "off",
    why: "Otherwise the browser prints the date and the web address across your label.",
  },
];

export const TROUBLESHOOTING: Array<{ id: string; symptom: string; fixes: string[] }> = [
  {
    id: "tiny",
    symptom: "The label came out tiny, or shrunk into a corner",
    fixes: [
      "Print from Chrome or Edge on the computer the printer is plugged into. Safari and phones ignore the paper size.",
      "In the dialog, set scale to Default or 100%, not Fit to page.",
    ],
  },
  {
    id: "fuzzy",
    symptom: "The barcode is fuzzy, grey or will not scan",
    fixes: [
      "In the printer driver's settings, set darkness to about 10–15 out of 30 and print a test.",
      "A good barcode is crisp black bars with clean white gaps. Too dark and the bars bleed together; too light and they break up.",
      "Check scale is 100%. A resized barcode can look fine and still not scan.",
    ],
  },
  {
    id: "blank",
    symptom: "Nothing printed, or the label came out blank",
    fixes: [
      "Check the destination in the dialog is the label printer, not Save as PDF.",
      "Thermal paper only darkens on its coated side. If the roll went in upside down, it prints blank. Flip it.",
      "Make sure the page had finished loading before you pressed Print.",
    ],
  },
  {
    id: "cut",
    symptom: "Half the label is cut off, or it spills onto a second label",
    fixes: [
      "The paper size in the dialog does not match the tab. Match them: 4×6 with 4×6, 80 mm with 80 mm.",
      "Set margins to None and untick headers and footers.",
    ],
  },
  {
    id: "copies",
    symptom: "More copies came out than I wanted",
    fixes: [
      "Set copies on the label page with − and +, and leave the print dialog's copies at 1. Several thermal drivers ignore the dialog's copies, so the page repeats the label itself.",
      "Small 2×1 labels start at two copies on purpose. Press − if you only need one.",
    ],
  },
  {
    id: "narrow",
    symptom: "My little receipt printer will not fit the label",
    fixes: ["A 58 mm pocket receipt printer is too narrow for a shipping label. Use the 80 mm printer or the 4×6 printer."],
  },
  {
    id: "open",
    symptom: "The label page says the package is still open",
    fixes: ["Go back and seal it first, so the label cannot fall out of date. Then print."],
  },
];

export const REPRINT_FACTS = [
  "After the first print, Print label becomes Reprint label and the box shows “Label printed ×1”, ×2, and so on.",
  "Every press of Print is counted, even if you cancel the dialog, so we always know how many copies of a label exist.",
  "Reprint whenever the box changes: after Reopen, or after editing the weight, size or handling marks.",
  "A deleted package's label stops scanning, so an old sticker can never open the wrong box.",
];

// ── Scanning ────────────────────────────────────────────────────────────────

export const SCAN_WAYS = [
  {
    id: "handheld",
    title: "Handheld scanner",
    body: "It behaves like a keyboard: it types the code and presses Enter. The Scan field is ready when you arrive and after every scan, so just keep pulling the trigger. It also works in the Receive search box and the Add items window.",
    reads: "Barcode (Code 128) and QR",
  },
  {
    id: "camera",
    title: "This phone's camera",
    body: "Press Scan with camera and allow the camera when the browser asks. It works in Chrome, Edge and iPhone Safari. Nothing is uploaded: frames never leave the phone.",
    reads: "The QR everywhere; the barcode as well in Chrome on Android",
  },
  {
    id: "camera-app",
    title: "The phone's Camera app",
    body: "The label's QR is a web address. Point any phone's Camera app at it and tap the link: the package opens. If you are not signed in, you sign in first. A stranger who scans a box sees only a login screen.",
    reads: "QR",
  },
  {
    id: "typing",
    title: "Typing",
    body: "Type the number printed under the barcode, like PKG-10042, or an order's TM-00042, and press Enter. Capitals, spaces and the dash do not matter.",
    reads: "PKG-… and TM-…",
  },
];

export const CODE_EXAMPLES = ["pkg-10042", "PKG10042", "tm-42", "10042", "https://tomame.ca/warehouse/p/PKG-10042", "1Z 999 AA1 0123 4567 84"];

export const CAMERA_USER_AGENTS = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  iphoneOther: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
  computer: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
} as const;

// ── Holds and issues ────────────────────────────────────────────────────────

export const VERDICTS = [
  { id: "looks_right", label: "Looks right", tone: "green", body: "Good news, not a ticket. Folded at the bottom of Issues. File it with Noted, file it." },
  { id: "wrong_item", label: "Wrong item", tone: "amber", body: "Not what they ordered." },
  { id: "wrong_variant", label: "Wrong size or colour", tone: "amber", body: "Right product, wrong version." },
  { id: "damaged", label: "Damaged", tone: "coral", body: "Something is broken or bent." },
  { id: "other", label: "Something else", tone: "neutral", body: "Read their words." },
] as const;

export const ISSUE_ACTIONS = [
  { label: "I'm on it", to: "Being looked at", body: "Tells the customer somebody has it. Use it the moment you start checking." },
  { label: "Sorted", to: "Sorted", body: "You fixed it. Write what you did first: the customer reads it word for word." },
  { label: "Nothing in it", to: "Dismissed", body: "You checked and the parcel is right. Say why, kindly." },
];

export const HOLD_FACTS = [
  "A hold needs a reason of at least a few words. The customer will be asked about it.",
  "A held item cannot be ticked, packed or sealed. A box with a held item in it will not seal.",
  "Holding does not change the order's status. It simply stops it moving.",
  "Release hold (or Release parcel on Issues) lets it move again. It does not advance it.",
  "A customer's complaint never holds a parcel by itself. You decide.",
];

// ── Mistakes ────────────────────────────────────────────────────────────────

export type Reversibility = "easy" | "careful" | "admin";

export const MISTAKES: Array<{ id: string; problem: string; fix: string; where: string; level: Reversibility }> = [
  {
    id: "weight",
    problem: "I typed the wrong weight when logging it in",
    fix: "Re-weigh it: the scale button on its Receive row, or Re-weigh on the item page. The customer's timeline shows “Re-weighed at our US hub”. Logging it again with the same weight changes nothing.",
    where: "Receive · Item page",
    level: "easy",
  },
  {
    id: "wrong-item",
    problem: "I put the wrong item in a box",
    fix: "While the box is packing, press × on that line. It goes straight back on the shelf.",
    where: "Package page → Inside",
    level: "easy",
  },
  {
    id: "sealed-early",
    problem: "I sealed it, then found one more item",
    fix: "Press Reopen, add the item, seal it again, then Reprint label. The old label is out of date.",
    where: "Package page",
    level: "careful",
  },
  {
    id: "empty",
    problem: "I started a package I do not need",
    fix: "Delete this package, at the bottom of the package page. It only works while packing. Everything inside goes back on the shelf, and any label printed for it stops scanning.",
    where: "Package page",
    level: "easy",
  },
  {
    id: "details",
    problem: "The box weight, size or handling marks are wrong",
    fix: "Edit Details and press Save details. If the label was already printed, reprint it so it matches.",
    where: "Package page → Details",
    level: "easy",
  },
  {
    id: "label",
    problem: "The label printed badly or got torn",
    fix: "Reprint it. Every print is counted, so reprinting is always safe.",
    where: "Label page",
    level: "easy",
  },
  {
    id: "photo",
    problem: "I sent the wrong photo",
    fix: "Take it down with the bin button on the photo, on the item page. Then send the right one.",
    where: "Item page → Photos",
    level: "careful",
  },
  {
    id: "hold",
    problem: "I put the wrong parcel on hold",
    fix: "Release hold on the item page, or Release parcel on Issues. Say what settled it if you like.",
    where: "Item page · Issues",
    level: "easy",
  },
  {
    id: "mixed",
    problem: "I mixed two customers by accident",
    fix: "Take the other customer's item out with × while the box is packing. If it is sealed, Reopen first.",
    where: "Package page → Inside",
    level: "careful",
  },
  {
    id: "logged-wrong",
    problem: "I logged in a parcel that is not actually here",
    fix: "There is no undo: the arrival is recorded on the order and the customer has been told. Tell an admin straight away, who will sort it out with the customer. (A wrong weight is different: Re-weigh records a new one.)",
    where: "Ask an admin",
    level: "admin",
  },
  {
    id: "shipped",
    problem: "I marked a box shipped too early",
    fix: "It cannot be undone from any screen: order statuses only move forward and customers are already notified. After shipping, only the carrier, waybill and notes can change. Contact an admin now, who will handle it with the customer.",
    where: "Ask an admin",
    level: "admin",
  },
];

// ── Ready for your first shift ──────────────────────────────────────────────

export const CHECKLIST: Array<{ id: string; label: string; auto?: "practice" | "quiz" }> = [
  { id: "signin", label: "I can sign in on the bench computer and on my phone" },
  { id: "printer", label: "I know which computer the label printer is plugged into" },
  { id: "test-print", label: "I have printed a test label and the barcode is crisp" },
  { id: "camera", label: "My phone's browser is allowed to use the camera" },
  { id: "scanner", label: "The handheld scanner types into the Scan field" },
  { id: "practice", label: "I finished the practice run", auto: "practice" },
  { id: "quiz", label: "I passed the quick check", auto: "quiz" },
];

export const QUIZ: QuizQuestion[] = [
  {
    id: "first",
    prompt: "A parcel comes off the truck. What do you do first?",
    options: [
      { id: "a", text: "Put it straight in a box for its customer" },
      { id: "b", text: "Log it in on Receive and type its weight" },
      { id: "c", text: "Print its label" },
    ],
    answer: "b",
    why: "Logging in is what tells the customer it arrived, and the weight is what the box is charged on.",
    section: "daily-flow",
  },
  {
    id: "held",
    prompt: "A customer says the photo shows the wrong colour. The item is in an open box. How do you stop the box going out?",
    options: [
      { id: "a", text: "Put the parcel on hold, with the reason" },
      { id: "b", text: "Nothing, the complaint holds it automatically" },
      { id: "c", text: "Seal the box quickly before anything else happens" },
    ],
    answer: "a",
    why: "A complaint never holds anything by itself. A held item stops the box from sealing until it is released or taken out.",
    section: "holds",
  },
  {
    id: "reopen",
    prompt: "You sealed a box, then found one more of the same customer's items. What now?",
    options: [
      { id: "a", text: "Start a second box for it" },
      { id: "b", text: "Reopen, add it, seal again, and reprint the label" },
      { id: "c", text: "Tape it to the outside" },
    ],
    answer: "b",
    why: "Sealing freezes the contents. Reopen lets them change; the old label no longer matches, so reprint.",
    section: "mistakes",
  },
  {
    id: "where-print",
    prompt: "Where do you print labels from?",
    options: [
      { id: "a", text: "Your phone, in Safari" },
      { id: "b", text: "Any computer, in any browser" },
      { id: "c", text: "Chrome or Edge on the computer the printer is plugged into" },
    ],
    answer: "c",
    why: "Safari and phones ignore the paper size and shrink the label.",
    section: "printing",
  },
  {
    id: "dialog",
    prompt: "In the print dialog, which settings are right for a 4×6 label?",
    options: [
      { id: "a", text: "Paper 4 × 6 in, margins None, scale 100%" },
      { id: "b", text: "Paper Letter, margins Default, Fit to page" },
      { id: "c", text: "Whatever the dialog picks" },
    ],
    answer: "a",
    why: "The label is drawn edge to edge at real size. Any margin or scaling moves or resizes the barcode.",
    section: "printing",
  },
  {
    id: "camera-blocked",
    prompt: "You tapped “Don't allow” when the phone asked for the camera. How do you fix it?",
    options: [
      { id: "a", text: "Allow the camera in the browser's site settings, then Try again" },
      { id: "b", text: "Reinstall the browser" },
      { id: "c", text: "It cannot be fixed; use another phone" },
    ],
    answer: "a",
    why: "The Scan screen shows the exact steps for your browser, and a Try again button. Typing or a handheld scanner works meanwhile.",
    section: "scanning",
  },
  {
    id: "ship",
    prompt: "What happens when you press Ship it?",
    options: [
      { id: "a", text: "Nothing the customer sees until the box lands" },
      { id: "b", text: "Every order in the box moves to in transit and each customer is notified" },
      { id: "c", text: "The box can be reopened and changed later" },
    ],
    answer: "b",
    why: "Order statuses only move forward, so shipping cannot be undone from any screen. If you are unsure, press Not yet.",
    section: "daily-flow",
  },
  {
    id: "consolidated",
    prompt: "You put two customers' items in one box. What is it now?",
    options: [
      { id: "a", text: "A mistake the app will refuse" },
      { id: "b", text: "A consolidated carton, broken down in Accra. Print the manifest for its sleeve" },
      { id: "c", text: "Two packages" },
    ],
    answer: "b",
    why: "Mixing is allowed when you mean it. The label says CONSOLIDATED CARTON and lists who is inside; the manifest lists every line.",
    section: "consolidated",
  },
];

// ── FAQ and glossary ────────────────────────────────────────────────────────

export const FAQ: Array<Searchable & { section?: string }> = [
  {
    id: "no-weight",
    q: "Do I have to type a weight when I log a parcel in?",
    a: "The app lets you leave it blank and weigh later, but please weigh it now: the weight is what the box is charged on. To add or fix it later, use Re-weigh.",
    tags: ["scale", "pounds", "lb", "receive"],
    section: "daily-flow",
  },
  {
    id: "not-listed",
    q: "A parcel arrived but I cannot find it on Receive.",
    a: "Search its TM-number, the customer's name or the store. Only paid orders appear. If it is still missing, the order may not be paid yet. Keep the parcel aside and tell an admin.",
    tags: ["missing", "search", "expected"],
    section: "screens",
  },
  {
    id: "no-tm",
    q: "The parcel has no TM-number on it.",
    a: "Search by the customer's name or the store on Receive. If you cannot match it, put it aside and ask an admin rather than guessing.",
    tags: ["unknown", "label", "match"],
  },
  {
    id: "cannot-tick",
    q: "Why can I not tick an item?",
    a: "It is on hold, or it is already in a package. The row says which: a coral “On hold” badge, or “in PKG-…” next to its number.",
    tags: ["select", "checkbox", "hold", "disabled"],
    section: "holds",
  },
  {
    id: "wont-seal",
    q: "Seal package is greyed out.",
    a: "Either the box is empty (“Add at least one item first.”) or something inside is on hold. The reason is written under the button.",
    tags: ["seal", "disabled", "hold", "empty"],
    section: "daily-flow",
  },
  {
    id: "extra-item",
    q: "Can I add something that is not an order, like a replacement charger?",
    a: "Yes. In Add items, choose Describe an item. It is printed on the label and manifest, but it is not linked to an order, so no customer is notified about it.",
    tags: ["describe", "note", "custom", "add items"],
  },
  {
    id: "fuzzy",
    q: "Why is my label fuzzy or blurry?",
    a: "Set the printer driver's darkness to about 10–15 of 30, print at 100% scale, and print a test. Crisp black bars with clean white gaps scan every time.",
    tags: ["print", "barcode", "dark", "grey"],
    section: "printing",
  },
  {
    id: "tiny",
    q: "Why did my label print tiny?",
    a: "It was printed from Safari or a phone, or scale was set to Fit to page. Print from Chrome or Edge on the printer's computer at 100%.",
    tags: ["print", "small", "shrink", "safari"],
    section: "printing",
  },
  {
    id: "reprint",
    q: "Is it OK to reprint a label?",
    a: "Always. Each print is counted, so we know how many copies exist. Reprint after Reopen or after changing the box's details.",
    tags: ["print", "count", "copy"],
    section: "printing",
  },
  {
    id: "camera",
    q: "The camera will not open on my phone.",
    a: "You probably said no when the browser asked. Allow the camera in the browser's site settings (the Scan screen shows the steps for your phone) and tap Try again. Meanwhile, type the code or use the handheld scanner.",
    tags: ["camera", "permission", "iphone", "android", "safari", "chrome"],
    section: "scanning",
  },
  {
    id: "qr-phone",
    q: "Can I scan a label with the iPhone's Camera app?",
    a: "Yes. The QR is a web address: point the Camera app at it and tap the link. You land on the package, after signing in if you need to.",
    tags: ["qr", "iphone", "camera app"],
    section: "scanning",
  },
  {
    id: "not-found",
    q: "The scanner says “That code is not a Tomame package or order”.",
    a: "It read a store's barcode, not ours. Scan the Tomame label (PKG-…) or type the parcel's TM-number instead.",
    tags: ["scan", "error", "barcode", "not found"],
    section: "scanning",
  },
  {
    id: "two-customers",
    q: "Can one box hold two customers' items?",
    a: "Yes, that makes a consolidated carton. It is broken down in Accra and each parcel goes on to its own door. Print the manifest for its sleeve.",
    tags: ["mix", "consolidated", "carton"],
    section: "consolidated",
  },
  {
    id: "ship-wrong",
    q: "I pressed Ship it by mistake. Can I undo it?",
    a: "No. Order statuses only move forward, so nobody can undo it from a screen, and customers have already been notified. Only the carrier, waybill and notes can still change. Contact an admin straight away, who will handle it with the customer.",
    tags: ["ship", "undo", "mistake"],
    section: "mistakes",
  },
  {
    id: "complaint",
    q: "A customer says the item is wrong. Does it stop the parcel?",
    a: "Not by itself. If the parcel should not leave, press Hold parcel and say why. Then check it, and answer with Sorted or Nothing in it.",
    tags: ["issue", "hold", "wrong item"],
    section: "holds",
  },
  {
    id: "notes",
    q: "Who reads the “Notes for the team” on a package?",
    a: "Only Tomame staff. They are never printed on the label and customers never see them.",
    tags: ["notes", "private", "label"],
  },
  {
    id: "photo-private",
    q: "Can I take a photo without the customer seeing it?",
    a: "Yes. Untick “Show this to the customer” before sending. It is kept internal.",
    tags: ["photo", "private", "internal"],
    section: "daily-flow",
  },
  {
    id: "admin",
    q: "I cannot open the admin console.",
    a: "That is expected: a warehouse operator's account only reaches the packaging platform. Ask an admin for anything outside it.",
    tags: ["access", "role", "admin"],
    section: "first-day",
  },
];

export const GLOSSARY: Searchable[] = [
  { id: "tm", q: "TM-number", a: "An order's number, like TM-00042. One order is one item line for one customer." },
  { id: "pkg", q: "Package (PKG-…)", a: "A box you pack, like PKG-10042. Its number is on the label's barcode and QR." },
  { id: "expected", q: "Expected", a: "A paid order on its way to the hub, not logged in yet." },
  { id: "shelf", q: "On the shelf", a: "Logged in at the hub and waiting to be packed." },
  { id: "packed", q: "Packed", a: "In a package that has not left yet." },
  { id: "shipped", q: "Shipped", a: "Left the hub. The customer's order is in transit." },
  { id: "log-in", q: "Log in (a parcel)", a: "Record that a parcel has arrived, with its weight. Not the same as signing in to the app." },
  { id: "reweigh", q: "Re-weigh", a: "Correct a parcel's recorded weight. The customer's timeline shows it as a re-weigh." },
  { id: "hub-photo", q: "Hub photo", a: "A picture you took of the actual parcel. Marked with a green dot on thumbnails." },
  { id: "hold", q: "Hold", a: "A stop on one parcel, with a reason. It cannot be packed or sealed until released." },
  { id: "seal", q: "Seal", a: "Close a package. Its contents are frozen until you reopen it." },
  { id: "reopen", q: "Reopen", a: "Unseal a package that has not shipped, so its contents can change. Reprint the label after." },
  { id: "consolidated", q: "Consolidated carton", a: "One box holding more than one customer's items. Broken down on landing in Accra." },
  { id: "manifest", q: "Manifest", a: "The printed contents list for a package's sleeve: every line and who it belongs to." },
  { id: "handling", q: "Handling marks", a: "Fragile, This way up and Keep dry. Printed along the bottom of the label." },
  { id: "print-count", q: "Label print count", a: "How many times a package's label has been printed. Shown as “Label printed ×N”." },
  { id: "described", q: "Described item", a: "A line added by hand in Add items, not linked to an order. On the label, but no one is notified." },
  { id: "waybill", q: "Waybill", a: "The carrier's tracking number for the box. Customers see it once it ships." },
  { id: "freight-box", q: "Freight box", a: "The weekly flight a customer's items are booked on, with its departure date." },
  { id: "air-sea", q: "Air / Sea", a: "The freight service for a package. Printed large at the top right of the label." },
  { id: "issue", q: "Issue", a: "A customer's reply to a photo saying something is wrong. Worked on the Issues screen." },
];
