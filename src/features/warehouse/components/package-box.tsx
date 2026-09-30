"use client";

import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

import type { PackageStatus } from "../types";

/**
 * A cardboard box, drawn — the platform's one piece of illustration (081).
 *
 * It carries state rather than decorating it. Flaps up means "open on the
 * bench"; Tomame tape across the seam means sealed; a green stamp means it has
 * left. An operator scanning a grid of these reads the bench from the shapes
 * before reading a single word.
 *
 * `open` overrides the status for the peek animation, where a sealed box is
 * opened on screen to show what is inside. The flaps hinge at their OUTER top
 * corners and swing out — a cartoon box, legible at 64px and at 320px.
 */

export interface PackageBoxProps {
  status: PackageStatus;
  /** Force the flaps open or shut; defaults to "open while packing". */
  open?: boolean;
  reference?: string;
  /** Pixel width; height follows at 0.82. */
  size?: number;
  className?: string;
}

const EASE = [0.16, 1, 0.3, 1] as const;

export function PackageBox({
  status,
  open,
  reference,
  size = 120,
  className,
}: PackageBoxProps) {
  const reduce = useReducedMotion();
  const isOpen = open ?? status === "packing";
  const sealed = !isOpen && status !== "packing";
  const width = size;
  const height = Math.round(size * 0.82);
  const flapH = Math.round(height * 0.2);
  const bodyTop = flapH;
  const flapLen = Math.round(width * 0.36);
  const flapT = Math.max(5, Math.round(height * 0.17));

  const flapTransition = reduce ? { duration: 0 } : { duration: 0.65, ease: EASE };

  return (
    <div
      className={cn("relative select-none", className)}
      style={{ width, height: height + flapH }}
      aria-hidden
    >
      {/* Shadow on the floor */}
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-[50%] bg-tm-ink/15 blur-[6px]"
        style={{ bottom: -size * 0.04, width: width * 0.86, height: size * 0.08 }}
      />

      {/* The inside of the box, seen through the open top */}
      <div
        className="absolute overflow-hidden rounded-t-[6px]"
        style={{
          left: width * 0.04,
          right: width * 0.04,
          top: bodyTop - 2,
          height: flapH * 1.1,
          background: "linear-gradient(180deg,#6b4220 0%,#8d5d31 100%)",
          opacity: isOpen ? 1 : 0,
          transition: "opacity .3s",
        }}
      />

      {/*
        The flaps. Each is hinged on the body's top OUTER corner and swings up
        and out past vertical, the way a real carton's side flaps fall open.
        Shut, it slides down behind the front face and is not drawn at all.
      */}
      {(["left", "right"] as const).map((side) => (
        <motion.div
          key={side}
          className="absolute rounded-[4px]"
          style={{
            [side]: 0,
            top: bodyTop - flapT,
            width: flapLen,
            height: flapT,
            transformOrigin: side === "left" ? `0px ${flapT}px` : `${flapLen}px ${flapT}px`,
            background:
              side === "left"
                ? "linear-gradient(0deg,#ecc28f 0%,#dcaa6f 100%)"
                : "linear-gradient(0deg,#e6b983 0%,#d0995c 100%)",
            boxShadow: "inset 0 -2px 0 rgba(120,72,30,.18)",
          }}
          initial={false}
          animate={{ rotate: isOpen ? (side === "left" ? -122 : 122) : 0, y: isOpen ? 0 : flapT }}
          transition={{ ...flapTransition, delay: reduce ? 0 : side === "right" ? 0.07 : 0 }}
        />
      ))}

      {/* Front face */}
      <div
        className="absolute inset-x-0 bottom-0 overflow-hidden rounded-[8px]"
        style={{
          top: bodyTop,
          background: "linear-gradient(180deg,#e0ad72 0%,#cf9859 58%,#c48b4d 100%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,.35), inset 0 -6px 12px rgba(110,62,20,.18)",
        }}
      >
        {/* Corrugation lines */}
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: "repeating-linear-gradient(90deg,#5b3514 0 1px,transparent 1px 7px)",
          }}
        />

        {/* Tomame tape down the seam once sealed */}
        <motion.div
          className="absolute top-0 left-1/2 -translate-x-1/2"
          style={{
            width: Math.max(8, width * 0.13),
            background: "linear-gradient(180deg,#f43f5e,#f97316)",
            boxShadow: "0 0 0 1px rgba(255,255,255,.18) inset",
          }}
          initial={false}
          animate={{ height: sealed ? height * 0.42 : 0, opacity: sealed ? 0.95 : 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.5, ease: EASE, delay: sealed ? 0.35 : 0 }}
        />

        {/* The label sticker */}
        {size >= 88 ? (
          <div
            className="absolute rounded-[3px] bg-white/95 shadow-[0_1px_2px_rgba(0,0,0,.15)]"
            style={{
              right: width * 0.1,
              bottom: height * 0.14,
              width: width * 0.36,
              height: height * 0.3,
              padding: Math.max(2, size * 0.02),
            }}
          >
            <div className="flex h-full gap-[6%]">
              <div
                className="aspect-square h-full shrink-0"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg,#2b2422 50%,transparent 0),linear-gradient(#2b2422 50%,transparent 0)",
                  backgroundSize: `${Math.max(3, size * 0.03)}px ${Math.max(3, size * 0.03)}px`,
                  opacity: 0.85,
                }}
              />
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-[12%]">
                {reference && size >= 150 ? (
                  <span
                    className="truncate font-mono leading-none font-bold text-tm-ink"
                    style={{ fontSize: Math.max(7, size * 0.045) }}
                  >
                    {reference}
                  </span>
                ) : (
                  <span className="h-[18%] w-[80%] rounded-full bg-tm-ink/70" />
                )}
                <span className="h-[14%] w-full rounded-full bg-tm-ink/25" />
                <span className="h-[14%] w-[60%] rounded-full bg-tm-ink/25" />
              </div>
            </div>
          </div>
        ) : null}

        {/* This-way-up arrows, the universal box mark */}
        {size >= 88 ? (
          <div
            className="absolute flex gap-[2px] text-[#7a4a1d]/60"
            style={{ left: width * 0.1, bottom: height * 0.16, fontSize: size * 0.1 }}
          >
            <span className="leading-none font-black">↑↑</span>
          </div>
        ) : null}

        {/* Shipped stamp */}
        {status === "shipped" && !isOpen ? (
          <motion.div
            className="absolute rounded-[4px] border-2 border-tm-green font-display leading-none font-extrabold tracking-[0.08em] text-tm-green uppercase"
            style={{
              left: width * 0.08,
              top: height * 0.1,
              fontSize: Math.max(7, size * 0.07),
              padding: `${size * 0.015}px ${size * 0.03}px`,
              background: "rgba(238,248,241,.72)",
            }}
            initial={reduce ? false : { scale: 1.6, opacity: 0, rotate: -14 }}
            animate={{ scale: 1, opacity: 1, rotate: -9 }}
            transition={{ duration: 0.35, ease: EASE, delay: 0.2 }}
          >
            Shipped
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}
