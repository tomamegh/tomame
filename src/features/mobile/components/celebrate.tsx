"use client";

import { useEffect, useRef } from "react";

import { haptic } from "@/lib/native/bridge";

/** Confetti and a success haptic, once, when the Paid screen opens. */
export function Celebrate() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const t = setTimeout(() => haptic("success"), 250);
    const cv = ref.current;
    if (!cv || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => clearTimeout(t);
    const w = window.innerWidth, h = window.innerHeight;
    cv.width = w * 2;
    cv.height = h * 2;
    const c = cv.getContext("2d");
    if (!c) return () => clearTimeout(t);
    c.scale(2, 2);
    const cols = ["#f43f5e", "#f97316", "#f59e0b", "#1e9a5c", "#ffcc00", "#f25b3d"];
    const ps = Array.from({ length: 120 }, () => ({
      x: w / 2, y: 170, vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 10 - 3,
      s: 4 + Math.random() * 5, c: cols[(Math.random() * cols.length) | 0]!, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.3,
    }));
    let f = 0, raf = 0;
    const loop = () => {
      c.clearRect(0, 0, w, h);
      for (const p of ps) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.28; p.vx *= 0.99; p.a += p.va;
        c.save(); c.translate(p.x, p.y); c.rotate(p.a); c.fillStyle = p.c; c.globalAlpha = Math.max(0, 1 - f / 160);
        c.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); c.restore();
      }
      if (++f < 170) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { clearTimeout(t); cancelAnimationFrame(raf); };
  }, []);

  return <canvas ref={ref} className="confetti" aria-hidden />;
}
