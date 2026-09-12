import { cn } from "@/lib/utils";

/** `tmWords` has five stops, so the stack is always four names plus a repeat. */
const VISIBLE_STOPS = 4;

export interface StoreCyclerProps {
  /** Store names from the live region — never a literal list. */
  stores: readonly string[];
  /** Row height in px; also the window height. Matches the surrounding line-height. */
  rowHeight?: number;
  className?: string;
}

/**
 * The hero's rotating store name.
 *
 * The mock animates `translateY(-100%…-400%)`, which resolves against the whole
 * stack rather than one row and leaves a blank gap. The design system's
 * `tmWords` steps by `--tm-word-h` instead, so the window shows exactly one
 * name at a time.
 */
export function StoreCycler({
  stores,
  rowHeight = 22,
  className,
}: StoreCyclerProps) {
  if (stores.length === 0) return null;

  const stack = Array.from(
    { length: VISIBLE_STOPS + 1 },
    (_, index) => stores[index % stores.length]!,
  );

  return (
    <span
      className={cn("tm-words-window font-semibold text-tm-ink", className)}
      style={{ "--tm-word-h": `${rowHeight}px` } as React.CSSProperties}
    >
      {/* The full list is announced once; the animated stack is decorative. */}
      <span className="sr-only">{stores.join(", ")}</span>
      <span className="tm-words" aria-hidden>
        {stack.map((store, index) => (
          <span key={`${store}-${index}`} className="tm-word whitespace-nowrap">
            {store}
          </span>
        ))}
      </span>
    </span>
  );
}
