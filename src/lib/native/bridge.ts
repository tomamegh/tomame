/**
 * The iPhone app's native bridge.
 *
 * The app (native/) is a Capacitor shell that loads `/m` from this site, and Capacitor injects
 * `window.Capacitor` into the page. Everything here goes through that global, so the web build
 * carries no native dependency and every call is a silent no-op in an ordinary browser.
 */

export type HapticKind = "light" | "medium" | "heavy" | "select" | "success" | "warning" | "error";

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, unknown>;
}

interface HapticsPlugin {
  impact(o: { style: "LIGHT" | "MEDIUM" | "HEAVY" }): Promise<void>;
  notification(o: { type: "SUCCESS" | "WARNING" | "ERROR" }): Promise<void>;
  selectionStart(): Promise<void>;
  selectionChanged(): Promise<void>;
  selectionEnd(): Promise<void>;
}
interface ClipboardPlugin {
  read(): Promise<{ value: string; type: string }>;
  write(o: { string: string }): Promise<void>;
}
interface SharePlugin {
  share(o: { title?: string; text?: string; url?: string }): Promise<unknown>;
}
interface StatusBarPlugin {
  setStyle(o: { style: "DARK" | "LIGHT" | "DEFAULT" }): Promise<void>;
}
interface AppPlugin {
  addListener(ev: "appStateChange", fn: (s: { isActive: boolean }) => void): Promise<{ remove: () => Promise<void> }> | { remove: () => Promise<void> };
}

const cap = (): CapacitorGlobal | undefined =>
  typeof window === "undefined" ? undefined : (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;

/** True inside the iPhone app, false in any browser (including the server render). */
export const isNative = (): boolean => !!cap()?.isNativePlatform?.();

function plugin<T>(name: string): T | undefined {
  return isNative() ? (cap()?.Plugins?.[name] as T | undefined) : undefined;
}

const HAPTICS_KEY = "tm-haptics";

/** The customer's Account switch. On unless they turned it off on this phone. */
export function hapticsEnabled(): boolean {
  try {
    return typeof window === "undefined" || window.localStorage.getItem(HAPTICS_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setHapticsEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(HAPTICS_KEY, on ? "on" : "off");
  } catch {
    // Private mode or blocked storage: the switch lasts for this session only.
  }
}

/** Fire a haptic. Inside the app it is Capacitor Haptics; in a browser it falls back to a short vibration where supported. */
export function haptic(kind: HapticKind = "light"): void {
  if (!hapticsEnabled()) return;
  const h = plugin<HapticsPlugin>("Haptics");
  if (h) {
    const run =
      kind === "select"
        ? h.selectionStart().then(() => h.selectionChanged()).then(() => h.selectionEnd())
        : kind === "success" || kind === "warning" || kind === "error"
          ? h.notification({ type: kind.toUpperCase() as "SUCCESS" | "WARNING" | "ERROR" })
          : h.impact({ style: kind.toUpperCase() as "LIGHT" | "MEDIUM" | "HEAVY" });
    void run.catch(() => {});
    return;
  }
  try {
    const ms = { light: 8, select: 4, medium: 15, heavy: 28, success: 20, warning: 30, error: 40 }[kind];
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(ms);
  } catch {
    // Vibration is a nicety; a browser that refuses it changes nothing.
  }
}

/** The clipboard's text inside the app (no paste prompt there); undefined in a browser. */
export async function readClipboard(): Promise<string | undefined> {
  const c = plugin<ClipboardPlugin>("Clipboard");
  if (!c) return undefined;
  try {
    const r = await c.read();
    return r.type.startsWith("text") ? r.value : undefined;
  } catch {
    return undefined;
  }
}

export async function copyText(text: string): Promise<void> {
  const c = plugin<ClipboardPlugin>("Clipboard");
  if (c) return c.write({ string: text }).catch(() => {});
  await navigator.clipboard?.writeText(text).catch(() => {});
}

/** Native share sheet in the app, Web Share in a browser that has it. Returns false when neither exists. */
export async function share(o: { title?: string; text?: string; url?: string }): Promise<boolean> {
  const s = plugin<SharePlugin>("Share");
  if (s) {
    await s.share(o).catch(() => {});
    return true;
  }
  if (typeof navigator !== "undefined" && navigator.share) {
    await navigator.share(o).catch(() => {});
    return true;
  }
  return false;
}

export function setStatusBar(style: "dark-text" | "light-text"): void {
  void plugin<StatusBarPlugin>("StatusBar")
    ?.setStyle({ style: style === "dark-text" ? "LIGHT" : "DARK" })
    .catch(() => {});
}

/** Calls `fn` whenever the app comes back to the foreground. Returns an unsubscribe. */
export function onAppResume(fn: () => void): () => void {
  const a = plugin<AppPlugin>("App");
  if (!a) return () => {};
  let remove: (() => Promise<void>) | undefined;
  try {
    // The bridge hands back the handle itself or a promise of it, depending on the plugin path.
    void Promise.resolve(a.addListener("appStateChange", (s) => s.isActive && fn()))
      .then((h) => (remove = h.remove))
      .catch(() => {});
  } catch {
    return () => {};
  }
  return () => void remove?.().catch(() => {});
}

/* ── Local notifications (reminders the phone schedules itself) ─────────────────────── */

export interface PhoneNotification {
  id: number;
  title: string;
  body: string;
  schedule?: { at: Date; allowWhileIdle?: boolean };
  extra?: Record<string, string>;
}
interface LocalNotificationsPlugin {
  checkPermissions(): Promise<{ display: string }>;
  requestPermissions(): Promise<{ display: string }>;
  schedule(o: { notifications: PhoneNotification[] }): Promise<unknown>;
  getPending(): Promise<{ notifications: { id: number; extra?: Record<string, string> }[] }>;
  cancel(o: { notifications: { id: number }[] }): Promise<void>;
  addListener(
    ev: "localNotificationActionPerformed",
    fn: (e: { notification: { extra?: Record<string, string> } }) => void,
  ): Promise<{ remove: () => Promise<void> }> | { remove: () => Promise<void> };
}

export const localNotifications = (): LocalNotificationsPlugin | undefined => plugin<LocalNotificationsPlugin>("LocalNotifications");

/** Asks once; answers whether the phone will show Tomame's notifications. */
export async function ensureNotificationPermission(): Promise<boolean> {
  const ln = localNotifications();
  if (!ln) return false;
  try {
    const now = await ln.checkPermissions();
    if (now.display === "granted") return true;
    if (now.display === "denied") return false;
    return (await ln.requestPermissions()).display === "granted";
  } catch {
    return false;
  }
}

/** Calls `fn` with the `href` of any Tomame notification the customer taps. */
export function onNotificationTap(fn: (href: string) => void): () => void {
  const ln = localNotifications();
  if (!ln) return () => {};
  let remove: (() => Promise<void>) | undefined;
  try {
    void Promise.resolve(ln.addListener("localNotificationActionPerformed", (e) => {
      const href = e.notification.extra?.href;
      if (href && href.startsWith("/m")) fn(href);
    }))
      .then((h) => (remove = h.remove))
      .catch(() => {});
  } catch {
    return () => {};
  }
  return () => void remove?.().catch(() => {});
}
