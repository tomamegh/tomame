import { cn } from "@/lib/utils";

import type { LaneMapNode } from "../_lib/lane-map-nodes";

/**
 * The hero arc map — design/Tomame - Marketing v2.dc.html #mk-regions.
 *
 * Geometry is the mock's, verbatim: a 600×440 stage, one cubic per lane, and
 * a plane flying the US arc on `offset-path` + `tmArc 6s linear infinite`.
 *
 * The plane rides INSIDE the <svg> rather than as an absolutely-positioned
 * span: `offset-path` on an SVG child resolves in user units, so the whole
 * flight path scales with the viewBox instead of desyncing the moment the
 * stage is anything other than exactly 600px wide.
 *
 * Hub labels stay HTML so their text does not shrink with the graphic. Below
 * `md` the stage is too narrow for three of them to sit side by side without
 * colliding, so they drop out of the overlay and print as a legend under the
 * card — same labels, same order, no clipped text.
 */

/** Phosphor `Airplane`, weight `fill`, 256-unit viewBox. */
const AIRPLANE_FILL_PATH =
  "M240,136v32a8,8,0,0,1-8,8,7.61,7.61,0,0,1-1.57-.16L156,161v23.73l17.66,17.65A8,8,0,0,1,176,208v24a8,8,0,0,1-11,7.43l-37-14.81L91,239.43A8,8,0,0,1,80,232V208a8,8,0,0,1,2.34-5.66L100,184.69V161L25.57,175.84A7.61,7.61,0,0,1,24,176a8,8,0,0,1-8-8V136a8,8,0,0,1,4.42-7.16L100,89.06V44a28,28,0,0,1,56,0V89.06l79.58,39.78A8,8,0,0,1,240,136Z";

/** 18px glyph, centred on the path point, nose turned along the tangent. */
const PLANE_TRANSFORM = "rotate(90) translate(-9,-9) scale(0.0703125)";

const STAGE_WIDTH = 600;
const STAGE_HEIGHT = 440;

/** Accra sits at the mouth of every lane. */
const DESTINATION = { x: 430, y: 330 } as const;

export interface LaneMapProps {
  nodes: readonly LaneMapNode[];
  /** Label for the Ghana end of every arc, e.g. "🇬🇭 Accra". */
  destinationLabel: string;
  className?: string;
}

export function LaneMap({ nodes, destinationLabel, className }: LaneMapProps) {
  const flightPath = nodes.find((node) => node.status === "live")?.path ?? null;

  return (
    <div className={cn("w-full", className)}>
      <div
        className="relative w-full overflow-hidden rounded-3xl border border-tm-border bg-card"
        style={{ aspectRatio: `${STAGE_WIDTH} / ${STAGE_HEIGHT}` }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_60%_60%,var(--tm-tint)_0%,transparent_60%)]"
        />

        <svg
          viewBox={`0 0 ${STAGE_WIDTH} ${STAGE_HEIGHT}`}
          fill="none"
          className="absolute inset-0 size-full"
          role="img"
          aria-label={`Shipping lanes into ${destinationLabel}`}
        >
          {nodes.map((node) => (
            <path
              key={node.code}
              d={node.path}
              stroke="var(--tm-border)"
              strokeWidth={2}
              strokeDasharray="6 8"
            />
          ))}

          {flightPath ? (
            <g
              className="tm-arc text-tm-coral"
              style={{
                offsetPath: `path('${flightPath}')`,
                offsetRotate: "auto",
              }}
            >
              <g transform={PLANE_TRANSFORM}>
                <path d={AIRPLANE_FILL_PATH} fill="currentColor" />
              </g>
            </g>
          ) : null}
        </svg>

        <ul className="absolute inset-0 hidden list-none md:block">
          {nodes.map((node, index) => (
            <li
              key={node.code}
              className="absolute"
              style={{
                left: `${(node.x / STAGE_WIDTH) * 100}%`,
                top: `${(node.y / STAGE_HEIGHT) * 100}%`,
              }}
            >
              <span
                className={cn(
                  "tm-up inline-flex items-center gap-2 whitespace-nowrap rounded-full",
                  "border border-tm-border bg-card px-3 py-2.5",
                  "text-[13px] font-semibold leading-none",
                  "shadow-[0_8px_20px_-12px_rgba(43,36,34,0.3)]",
                  anchorClass(node.x),
                  node.status === "live" ? "text-tm-ink" : "opacity-60",
                )}
                style={{ animationDelay: `${0.2 + index * 0.12}s` }}
              >
                <span aria-hidden="true">{node.flag}</span>
                <span>{node.city}</span>
                <span
                  className={cn(
                    "tm-nums",
                    node.status === "live" ? "text-tm-text-2" : "text-tm-amber",
                  )}
                >
                  · {node.detail}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <span
          className={cn(
            "tm-cta-gradient tm-pop absolute inline-flex -translate-x-1/2 items-center gap-2",
            "whitespace-nowrap rounded-full px-3 py-2.5 text-[12px] font-bold leading-none md:text-[14px]",
            "shadow-[0_12px_28px_-12px_rgba(244,63,94,0.6)]",
          )}
          style={{
            left: `${(DESTINATION.x / STAGE_WIDTH) * 100}%`,
            top: `${(DESTINATION.y / STAGE_HEIGHT) * 100}%`,
            animationDelay: "0.8s",
          }}
        >
          {destinationLabel}
        </span>
      </div>

      {/* Phone: the same labels, under the graphic instead of over it. */}
      <ul className="mt-3 flex flex-wrap gap-2 md:hidden">
        {nodes.map((node, index) => (
          <li
            key={node.code}
            className={cn(
              "tm-up inline-flex items-center gap-1.5 rounded-full border border-tm-border bg-card",
              "px-3 py-2 text-[12px] font-semibold leading-none",
              node.status === "live" ? "text-tm-ink" : "opacity-70",
            )}
            style={{ animationDelay: `${0.2 + index * 0.12}s` }}
          >
            <span aria-hidden="true">{node.flag}</span>
            <span>{node.city}</span>
            <span
              className={cn(
                "tm-nums",
                node.status === "live" ? "text-tm-text-2" : "text-tm-amber",
              )}
            >
              · {node.detail}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Keep a label inside the card: hug the left edge near the left of the stage,
 * hug the right edge near the right, centre it everywhere between.
 */
function anchorClass(x: number): string {
  const ratio = x / STAGE_WIDTH;
  if (ratio < 0.34) return "";
  if (ratio > 0.66) return "-translate-x-full";
  return "-translate-x-1/2";
}
