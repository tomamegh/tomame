/**
 * Delivery windows (Seamless Roadmap, Initiative 5). Pure.
 *
 * A customer prefers a slot (`site_settings.delivery_window_slots`, Accra
 * time); staff give the exact window, usually 2 hours, when it goes out for
 * delivery. Accra is UTC, so clock times are UTC times.
 */

export interface WindowSlot {
  key: string;
  label: string;
  /** "09:00" */
  from: string;
  /** "12:00" */
  to: string;
}

/** The user's choice, 23 Nov 2026, used when the setting is missing or broken. */
export const DEFAULT_WINDOW_SLOTS: readonly WindowSlot[] = [
  { key: "morning", label: "Morning", from: "09:00", to: "12:00" },
  { key: "afternoon", label: "Afternoon", from: "12:00", to: "15:00" },
  { key: "evening", label: "Evening", from: "15:00", to: "18:00" },
];

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The setting's value as slots; anything malformed is dropped, and none left means the defaults. */
export function parseWindowSlots(value: unknown): WindowSlot[] {
  if (!Array.isArray(value)) return [...DEFAULT_WINDOW_SLOTS];
  const slots = value.flatMap((raw): WindowSlot[] => {
    if (!raw || typeof raw !== "object") return [];
    const r = raw as Record<string, unknown>;
    const key = typeof r.key === "string" ? r.key.trim() : "";
    const label = typeof r.label === "string" ? r.label.trim() : "";
    const from = typeof r.from === "string" ? r.from.trim() : "";
    const to = typeof r.to === "string" ? r.to.trim() : "";
    return key && label && HHMM.test(from) && HHMM.test(to) && from < to ? [{ key, label, from, to }] : [];
  });
  return slots.length > 0 ? slots : [...DEFAULT_WINDOW_SLOTS];
}

/** "9am", "12:30pm". */
export function clockText(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

/** "Afternoon, 12–3pm" (the suffix once when both ends share it). */
export function slotText(slot: WindowSlot): string {
  const from = clockText(slot.from);
  const to = clockText(slot.to);
  const shared = from.slice(-2) === to.slice(-2);
  return `${slot.label}, ${shared ? from.slice(0, -2) : from}–${to}`;
}

/** "today, 1–3pm", "tomorrow, 11am–1pm", "Thu 26 Nov, 1–3pm". */
export function windowText(startIso: string, endIso: string, now: Date = new Date()): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const from = clockText(start.toISOString().slice(11, 16));
  const to = clockText(end.toISOString().slice(11, 16));
  const shared = from.slice(-2) === to.slice(-2);
  const range = `${shared ? from.slice(0, -2) : from}–${to}`;
  const day = start.toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const dayText =
    day === today
      ? "today"
      : day === tomorrow
        ? "tomorrow"
        : start.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return `${dayText}, ${range}`;
}

/** Why a staff window cannot be given, or null. Half an hour to three hours, and not over. */
export function windowProblem(startIso: string, endIso: string, now: Date = new Date()): string | null {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "Pick a day and a time for the window.";
  if (end <= start) return "The window has to end after it starts.";
  const minutes = (end - start) / 60_000;
  if (minutes < 30 || minutes > 180) return "Give a window between half an hour and three hours long.";
  if (end <= now.getTime()) return "That window is already over.";
  return null;
}

/**
 * 126: the windows a customer who missed the rider can rebook into: the rest
 * of today's slots that start at least an hour from now, then tomorrow's.
 */
export function nextWindows(slots: readonly WindowSlot[], now: Date = new Date(), limit = 5): Array<{ start: string; end: string; label: string }> {
  const today = now.toISOString().slice(0, 10);
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const soonest = now.getTime() + 60 * 60_000;
  const out: Array<{ start: string; end: string; label: string }> = [];
  for (const day of [today, tomorrow]) {
    for (const slot of slots) {
      const start = new Date(`${day}T${slot.from}:00Z`);
      const end = new Date(`${day}T${slot.to}:00Z`);
      if (start.getTime() < soonest) continue;
      out.push({ start: start.toISOString(), end: end.toISOString(), label: `${windowText(start.toISOString(), end.toISOString(), now)}` });
    }
  }
  return out.slice(0, limit);
}
