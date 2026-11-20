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
 * The gradient id is fixed rather than per instance: every copy defines the
 * same gradient, so whichever the browser resolves draws the same tile.
 */
export function BrandMark({ size = 28, className, decorative = false }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "Tomame"}
      aria-hidden={decorative || undefined}
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id="tm-brand-mark-tile" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f43f5e" />
          <stop offset="0.6" stopColor="#f97316" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#tm-brand-mark-tile)" />
      {/* Globe */}
      <circle cx="14.5" cy="17.5" r="7.25" fill="none" stroke="#fff" strokeWidth="2.1" />
      <path d="M7.4 16.2c2.3 1.1 4.7 1.6 7.1 1.6s4.8-.5 7.1-1.6" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity="0.85" />
      {/* Flight arc, from the globe out to the top right, and the plane */}
      <path d="M9.5 24.6c5.6-.4 10.6-4.8 13.6-12.4" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" />
      <path d="M25.6 6.8l.3 6.6-2.3-1.7-2.8.4z" fill="#fff" />
    </svg>
  );
}
