import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A placeholder block with a light band sweeping across it. The band moves by
 * transform (`tm-sweep`), not background-position, so it stays on the
 * compositor; under reduced motion the global guard stops it.
 */
export function Shimmer({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span aria-hidden className={cn("relative block overflow-hidden rounded-md bg-muted", className)} {...props}>
      <span className="tm-sweep absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent dark:via-white/10" />
    </span>
  );
}
