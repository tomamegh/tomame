import { cn } from "@/lib/utils";

export interface BrandMarkProps {
  /** Rendered size in px (square). */
  size?: number;
  className?: string;
  /** Set when a surrounding link or label already names Tomame. */
  decorative?: boolean;
}

/**
 * The Tomame mark for small sizes: a coral tile with a globe and a flight
 * arc landing on it, drawn as vectors so it stays sharp at 20 px. The
 * illustrated globe, plane and container (`Logo variant="mark"` and the
 * lockup) is for big moments only; it blurs below about 60 px.
 *
 * The tile is a CSS gradient on the wrapper, not an SVG <linearGradient>: a
 * gradient referenced by id resolves to the first copy in the document, and
 * when that copy sits in a hidden element (a closed menu) Chrome paints the
 * tile empty everywhere else.
 */
export function BrandMark({ size = 28, className, decorative = false }: BrandMarkProps) {
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "Tomame"}
      aria-hidden={decorative || undefined}
      className={cn("inline-block shrink-0", className)}
      style={{
        width: size,
        height: size,
        borderRadius: size * (9 / 32),
        backgroundImage: "linear-gradient(135deg, #f43f5e 0%, #f97316 60%, #f59e0b 100%)",
      }}
    >
      <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden className="block">
        {/* Globe */}
        <circle cx="14.5" cy="17.5" r="7.25" fill="none" stroke="#fff" strokeWidth="2.1" />
        <path d="M7.4 16.2c2.3 1.1 4.7 1.6 7.1 1.6s4.8-.5 7.1-1.6" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity="0.85" />
        {/* Flight arc, from the globe out to the top right, and the plane */}
        <path d="M9.5 24.6c5.6-.4 10.6-4.8 13.6-12.4" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" />
        <path d="M25.6 6.8l.3 6.6-2.3-1.7-2.8.4z" fill="#fff" />
      </svg>
    </span>
  );
}
