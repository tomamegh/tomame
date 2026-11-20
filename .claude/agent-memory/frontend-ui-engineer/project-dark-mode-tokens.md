---
name: project-dark-mode-tokens
description: tm-* colour tokens do not change under .dark; dark mode needs semantic tokens or explicit dark: overrides
metadata:
  type: project
---

The raw `--tm-*` palette in `globals.css` is defined once on `:root` and is NOT redefined under `.dark`; only the shadcn semantic tokens (`--background`, `--card`, `--muted`, `--muted-foreground`, `--border`, `--foreground`) flip. Customer UI shipped light-only until the price finder (2026-11-20) was asked to work in dark mode.

**Why:** `text-tm-text-2` or `bg-tm-green-bg` on a dark card is unreadable or glaring; the `dark:` variant is `&:is(.dark *)`, so it matches descendants of `.dark`, never the `.dark` element itself.

**How to apply:** for surfaces and body text use `bg-card` / `bg-background` / `bg-muted` / `text-foreground` / `text-muted-foreground` / `border-border`; keep tm-* for accents and add a `dark:` pair to tinted surfaces (e.g. `bg-tm-green-bg dark:bg-tm-green/15`, `bg-tm-tint dark:bg-tm-coral/15`). To preview dark, wrap a subtree in `<div class="dark">` with a child that sets `bg-background text-foreground`. See [[project-motion-presets]].
