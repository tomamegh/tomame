"use client";

import { useRef, useState, type ReactNode } from "react";
import { BellRinging, Trash } from "@phosphor-icons/react";

import { haptic } from "@/lib/native/bridge";

const THRESHOLD = 96;

/**
 * A row that swipes: left past the threshold removes, right watches. A selection haptic marks
 * the threshold, a medium one confirms. Vertical drags are left to the page scroll.
 */
export function SwipeRow({ children, onRemove, onWatch }: { children: ReactNode; onRemove: () => void; onWatch?: () => void }) {
  const [dx, setDx] = useState(0);
  const [removing, setRemoving] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"x" | "y" | null>(null);
  const armed = useRef<-1 | 0 | 1>(0);
  const [dragging, setDragging] = useState(false);
  const [armedUi, setArmedUi] = useState(false);

  const arm = (next: -1 | 0 | 1) => {
    if (next !== armed.current) {
      armed.current = next;
      setArmedUi(next !== 0);
      if (next) haptic("select");
    }
  };

  return (
    <div className={`swipe${armedUi ? " armed" : ""}${removing ? " removing" : ""}`}>
      <div className="under" aria-hidden>
        <div className="l">{onWatch && <><BellRinging size={22} weight="fill" />Watch</>}</div>
        <div className="r">Remove<Trash size={22} weight="fill" /></div>
      </div>
      <div
        className={dragging ? "line dragging" : "line"}
        style={{ transform: `translateX(${dx}px)` }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button, a, input")) return;
          start.current = { x: e.clientX, y: e.clientY };
          axis.current = null;
          setDragging(true);
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          const mx = e.clientX - start.current.x, my = e.clientY - start.current.y;
          if (!axis.current) {
            if (Math.abs(mx) > 8) {
              axis.current = "x";
              e.currentTarget.setPointerCapture(e.pointerId);
            } else if (Math.abs(my) > 8) axis.current = "y";
          }
          if (axis.current !== "x") return;
          const next = mx > 0 ? (onWatch ? Math.min(mx, 150) : 0) : Math.max(mx, -170);
          setDx(next);
          arm(next <= -THRESHOLD ? -1 : next >= THRESHOLD ? 1 : 0);
        }}
        onPointerUp={() => {
          start.current = null;
          setDragging(false);
          if (armed.current === -1) {
            haptic("medium");
            setDx(-500);
            setRemoving(true);
            setTimeout(onRemove, 300);
          } else {
            if (armed.current === 1 && onWatch) {
              haptic("medium");
              onWatch();
            }
            setDx(0);
          }
          armed.current = 0;
          setArmedUi(false);
        }}
        onPointerCancel={() => {
          start.current = null;
          setDragging(false);
          setDx(0);
          armed.current = 0;
        }}
      >
        {children}
      </div>
    </div>
  );
}
