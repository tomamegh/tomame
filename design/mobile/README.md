# Tomame for iPhone: design prototype

This is a clickable prototype at 390 × 844, built with plain HTML, CSS and JS. The products and people in it are sample data for the designs only. The native build (Phase B) will use Tomame's real APIs and Supabase auth.

- **Run it:** start the `design-kit` entry in `.claude/launch.json`, then open <http://localhost:4321/mobile/>. On a wide screen it shows a phone frame, a list of screens, a haptics legend and buttons that simulate pushes.
- **Deep links:** `#home`, `#chat`, `#product/sony`, `#bag`, `#pay`, `#paid`, `#orders`, `#track`, `#watch`, `#account`, `#share`, `#lock`, `#welcome`.
- **Flags:**
  - `?pins=1` marks every place a haptic fires.
  - `?stage=0..6` sets the tracking stage.
  - `?reveal=1` shows the delivery code.
- **Screenshots:** `node shoot.mjs` writes `screens/` and `node shoot.mjs pins` writes `screens-haptics/`. It uses Chrome over the DevTools protocol at exactly 390 × 844 @3x. Run it with the server up.
- **Tokens:** these mirror the web app's `tm-*` palette and fonts (Bricolage Grotesque and Instrument Sans). The logo files are copied unchanged from `public/images/brand`.

## Haptics (Capacitor Haptics in Phase B)

| Moment | Haptic |
| --- | --- |
| Taps, tab switch, copy, chips | Impact · light (tabs: selection) |
| Quantity stepper, colour option, photo carousel page, swipe crossing its threshold, slide-to-pay ticks | Selection |
| Add to bag (thumbnail flies to the Bag tab), remove a line, pull-to-refresh | Impact · medium, then Success when it lands |
| Slide-to-pay reaches the end | Impact · heavy |
| Paid, tracking stage change, price drop, delivery code shown | Notification · success |
| Box closing soon, rate lock ending | Notification · warning |

## Proposed mobile-only features

1. **Clipboard pickup:** copy a link in any store app, open Tomame, and get "Price the link you copied?".
2. **Share extension:** tap Share → Tomame in Safari or the Amazon app to see the landed GH₵ price, then add it to the bag or watch it without leaving the app you're in.
3. **Live Activity and Dynamic Island:** follow the parcel from paid to door on the Lock Screen, with the plane moving along JFK → ACC.
4. **Rich push:** price drops, back in stock, rate moves, box closing and stage changes, each with an action. WhatsApp stays the first channel.
5. **Slide to pay with Face ID:** this stops accidental MoMo prompts. The phone shows "Check your phone" while it waits for approval.
6. **Delivery code behind Face ID:** hold to show it and release to hide it. It never appears on the Lock Screen.
7. **Gestures:** swipe bag lines to watch or remove (with undo), drag sheets down to close, pull to refresh, and swipe through photos.
8. **Voice and photo ask:** say what you want, or snap a product or screenshot, and Buy for me finds it. Chat stays the default way to shop.
9. **WhatsApp sign-in:** a 6-digit code that iOS fills in on its own, plus Sign in with Apple.
10. **Haptics setting:** an on/off switch, plus "Feel each haptic" in Account.
