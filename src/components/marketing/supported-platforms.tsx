"use client";

import { useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAnimationFrame, useReducedMotion } from "motion/react";
import { SUPPORTED_STORES } from "@/config/ui";

const GAP = 24; // px between items
const SPEED = 55; // px per second

export default function LandingPageSupportedPlatforms() {
  const prefersReducedMotion = useReducedMotion();
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const posRef = useRef<number[]>([]);
  const readyRef = useRef(false);

  useEffect(() => {
    const items = itemRefs.current.filter(Boolean) as HTMLAnchorElement[];
    if (!items.length) return;

    // Space items left-to-right with a fixed gap
    let x = 0;
    posRef.current = items.map((el) => {
      const pos = x;
      el.style.transform = `translateX(${pos}px)`;
      x += el.offsetWidth + GAP;
      return pos;
    });

    readyRef.current = true;
  }, []);

  useAnimationFrame((_, delta) => {
    if (!readyRef.current || prefersReducedMotion) return;

    const items = itemRefs.current.filter(Boolean) as HTMLAnchorElement[];
    const move = (SPEED * delta) / 1000;

    // Capture rightmost right-edge before any recycling this frame
    let rightEdge = Math.max(
      ...posRef.current.map((p, i) => p + (items[i]?.offsetWidth ?? 0))
    );

    posRef.current = posRef.current.map((pos, i) => {
      const w = items[i]?.offsetWidth ?? 0;
      const next = pos - move;

      if (next + w < 0) {
        // Item has fully exited left — place it after the current tail
        const recycled = rightEdge + GAP;
        rightEdge = recycled + w; // advance tail for any other exits this frame
        items[i]!.style.transform = `translateX(${recycled}px)`;
        return recycled;
      }

      items[i]!.style.transform = `translateX(${next}px)`;
      return next;
    });
  });

  return (
    <section className="bg-white py-12 sm:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="mb-6 text-center text-xs font-semibold uppercase tracking-widest text-stone-400">
          Supported platforms
        </p>

        <div className="relative h-12 overflow-hidden">
          <div
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-linear-to-r from-white to-transparent"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-linear-to-l from-white to-transparent"
            aria-hidden="true"
          />

          {SUPPORTED_STORES.map((store, i) => (
            <Link
              key={store.id}
              ref={(el) => { itemRefs.current[i] = el; }}
              href={store.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Visit ${store.name}`}
              className="absolute top-0 flex h-12 items-center justify-center rounded-xl border border-stone-100 bg-white px-5 opacity-50 grayscale shadow-sm transition-[opacity,filter,box-shadow] duration-300 hover:border-stone-200 hover:opacity-100 hover:grayscale-0 hover:shadow-md"
            >
              {store.logo ? (
                <Image
                  src={store.logo}
                  alt={store.name}
                  width={72}
                  height={24}
                  className="h-6 w-auto object-contain"
                />
              ) : (
                <span className={`whitespace-nowrap text-sm font-bold ${store.textClassName}`}>
                  {store.name}
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
