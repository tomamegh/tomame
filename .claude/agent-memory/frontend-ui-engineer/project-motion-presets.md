---
name: project-motion-presets
description: Shared motion system (src/lib/motion/presets.ts, NumberRoll) started with the AI price finder preview, and the rules it encodes
metadata:
  type: project
---

The "polish direction" (plan `docs/plans/2026-11-20-trust-and-polish.md`, C0) asks for one motion vocabulary: springs by `visualDuration` (<= 0.25 s), transform/opacity only, reduced motion honoured. It lives in `src/lib/motion/presets.ts` (`SPRING.snappy|smooth|layout|pop`, `riseIn`, `fadeIn`, `slideIn`, `popIn`, `stagger()`, `PRESS`) and `src/components/motion/number-roll.tsx` (odometer digits, tabular nums, sr-only value). First consumer: `src/features/finder/`.

**Why:** the owner wants Stripe/Linear-grade feel without layout shift; earlier motion in the app was ad-hoc stiffness/damping per component and CSS keyframes (`tm-*` utilities).

**How to apply:** wrap a surface in `<MotionConfig reducedMotion="user">` instead of branching on `useReducedMotion` everywhere; for indeterminate progress reuse the CSS `tm-sweep` utility (transform-based) rather than `tm-shimmer` (animates background-position). Lay components out with container queries (`@container` + `@md:`/`@4xl:`) when they must look right inside a preview frame. Related: [[project-dark-mode-tokens]].
