---
name: project-customer-ui-system
description: Customer-site visual system set in the 2026-11-20 trust & polish phase 1 — brand mark, Button states, shared status/price atoms, batch paste UI, and the rules they encode
metadata:
  type: project
---

Phase 1 of the site-wide visual direction (plan `docs/plans/2026-11-20-trust-and-polish.md`, "calm, premium, trustworthy") built one system the later routes should reuse rather than restyle per screen. Owner signs off phase 1 before phase 2 (bag + checkout, order/track, auth, info pages, account).

- Brand: `BrandMark` (vector tile) for anything under ~60 px; `Logo variant="horizontal"` = mark + wordmark is THE header lockup on marketing, app and auth. The illustration (`mark`, `lockup`) is for big moments only.
- Gradient only on the one primary action per screen (`Button variant="primary"` or `tm-cta-gradient`). A disabled gradient button is solid muted via a rule inside the `tm-cta-gradient` utility, so hand-rolled buttons get it too. Button has `loading`/`done` props and a `touch` (44 px) size; the default sizes were kept for admin.
- Atoms: `InlineStatus` (tone + title + what happens next + one action), `StatusPill`, `EmptyState`/`ErrorState` (ErrorState takes a wa.me href), `PriceDisplay` + `PriceBreakdownSheet`/`PriceBreakdownList` in `src/components/price/` (sheet on phones = the Dialog, which is already a bottom sheet below `sm`). Type scale utilities `tm-title-1/2/3`, `tm-body`, `tm-caption`, `tm-overline` in globals.css.
- Copy: pending/error copy is plain status, no jokes or exclamation marks; hold wording lives in `features/quote-checks/hold-copy.ts`, price wording in `config/price-story.ts`.

**Why:** the live site had four logo treatments, faded-pink disabled buttons, and casual copy ("being stubborn"); the owner wants it to read like an airline or banking app.

**How to apply:** new customer screens compose these atoms with semantic tokens (see [[project-dark-mode-tokens]]) and the motion presets ([[project-motion-presets]]); a status is an `InlineStatus`, never a coloured paragraph; Pay buttons explain why they wait (`payBlockReason` in bag format.ts) rather than relying on a server 409.
