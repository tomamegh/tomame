# Tomame for iPhone (Capacitor shell)

This is a native iPhone app that loads Tomame's mobile app, `/m`, from the Tomame web app. It is the same approach as Jimmy. Every screen is a real Next.js route that uses the same Supabase sign-in, services and APIs as the website, so a web deploy updates the app without a rebuild. You only need Xcode to install it. The design it follows is `design/mobile/`.

The page reaches native features through the `window.Capacitor` global that Capacitor injects (`src/lib/native/bridge.ts`). In a normal browser every call does nothing.

| Plugin | Used for |
| --- | --- |
| Haptics | tap, select, add to bag, slide-to-pay, paid, stage change |
| Clipboard | "Price the link you copied?" on Home, with no paste prompt |
| Share | share an order or a product |
| Status bar, splash screen, App (resume) | refresh when you come back to the app |
| Local notifications | reserved for reminders. A free Apple ID cannot receive push. |

## Pick the server

```
cd native
npm install
npm run sim     # http://localhost:3010/m — Simulator only (start the "tomame-mobile" dev server first)
npm run prod    # https://tomame.ca/m — what Kelvin's phone runs (real payments)
npm run dev     # https://dev.tomame.ca/m — test keys, shared dev data
```

Each command rewrites `server.url` in `capacitor.config.json` and runs `cap sync ios`.

## Install on your iPhone (free Apple ID)

1. `npm run prod`, then `npm run open` (opens Xcode).
2. In the App target, open Signing & Capabilities and set Team to your Personal Team. If Xcode says the bundle ID `ca.tomame.ios` is taken, change it to something unique.
3. Plug in the iPhone, pick it as the run destination, and press Run.
4. The first time only, on the phone, go to Settings → General → VPN & Device Management → your Apple ID → Trust.

A free account's install expires after 7 days. To renew it, plug the phone in and press Run again. Your account and orders are kept, because they live on the server.

## Later (needs the $99/yr account)

These all need the paid account:

- Push notifications from the server: price drops, stage changes.
- The Live Activity on the Lock Screen: needs a widget extension plus ActivityKit push updates.
- The Share extension: its own target with an App Group.
- TestFlight.
