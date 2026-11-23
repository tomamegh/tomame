"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";

import { haptic } from "@/lib/native/bridge";

/**
 * A bottom sheet: slides up over the screen, closes on the scrim, the ×, or a drag down on
 * the grabber past 120px. Rendered into the `.tm-m` root so its scoped styles apply.
 */
export function Sheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  const [drag, setDrag] = useState(0);
  const y0 = useRef<number | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.querySelector<HTMLElement>(".tm-m")), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !host) return null;
  return createPortal(
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div
        className={y0.current != null ? "sheet dragging" : "sheet"}
        style={{ ["--drag" as string]: `${drag}px` }}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        <div
          className="grabber"
          onPointerDown={(e) => {
            y0.current = e.clientY;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => y0.current != null && setDrag(Math.max(0, e.clientY - y0.current))}
          onPointerUp={() => {
            const d = drag;
            y0.current = null;
            setDrag(0);
            if (d > 120) {
              haptic("light");
              onClose();
            }
          }}
        >
          <span />
        </div>
        <button type="button" className="sheet-close" onClick={() => { haptic("light"); onClose(); }} aria-label="Close">
          <X size={16} weight="bold" />
        </button>
        {children}
      </div>
    </>,
    host,
  );
}
