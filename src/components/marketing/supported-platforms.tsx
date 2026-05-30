"use client";

import { useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAnimationFrame, useReducedMotion } from "motion/react";
import { SUPPORTED_STORES } from "@/config/ui";

const SPEED = 50; // px per second

export default function LandingPageSupportedPlatforms() {
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const posRef = useRef<number[]>([]);
  const stepRef = useRef(0);
  const readyRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const items = itemRefs.current.filter(Boolean) as HTMLAnchorElement[];
    if (!items.length) return;

    // Space items evenly across the full container width.
    // step == gap between item starts, so items always fill the container
    // and recycling one item to (maxPos + step) lands it exactly one slot
    // past the current tail — seamless loop with any number of items.
    const step = container.offsetWidth / items.length;
    stepRef.current = step;

    posRef.current = items.map((_, i) => {
      const pos = i * step;
      items[i]!.style.transform = `translateX(${pos}px)`;
      return pos;
    });

    readyRef.current = true;
  }, []);

  useAnimationFrame((_, delta) => {
    if (!readyRef.current || prefersReducedMotion) return;

    const items = itemRefs.current.filter(Boolean) as HTMLAnchorElement[];
    const move = (SPEED * delta) / 1000;
    const step = stepRef.current;

    // Snapshot max position before any recycling this frame
    let maxPos = Math.max(...posRef.current);

    posRef.current = posRef.current.map((pos, i) => {
      const w = items[i]?.offsetWidth ?? 0;
      const next = pos - move;

      if (next + w < 0) {
        // Fully exited left — recycle to one step past the current tail
        const recycled = maxPos + step;
        maxPos = recycled; // advance tail for any other exits this same frame
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

        <div className="relative h-12 overflow-hidden" ref={containerRef}>
          <div
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-linear-to-r from-white to-transparent"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-linear-to-l from-white to-transparent"
            aria-hidden="true"
          />

          {[...SUPPORTED_STORES, ...SUPPORTED_STORES].map((store, i) => (
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
