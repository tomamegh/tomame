import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import { Check, CircleNotch } from "@phosphor-icons/react/ssr"

import { cn } from "@/lib/utils"

/**
 * One button system for the customer site.
 *
 * The coral gradient (`primary`) is for the single primary action on a
 * screen; everything else is solid and neutral. A disabled button is a solid
 * muted fill, never a faded gradient: a washed-out pink button reads as
 * broken, a grey one reads as waiting.
 */
const buttonVariants = cva(
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-lg border border-transparent text-sm font-semibold outline-none select-none transition-[background-color,border-color,color,box-shadow,transform] duration-150 group/button focus-visible:ring-3 focus-visible:ring-tm-coral/35 focus-visible:ring-offset-1 focus-visible:ring-offset-background active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none aria-disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground",
        primary:
          "tm-cta-gradient shadow-[0_8px_20px_-10px_rgba(244,63,94,0.55)] hover:brightness-105 disabled:shadow-none aria-disabled:shadow-none",
        secondary:
          "bg-muted text-foreground hover:bg-tm-tint dark:hover:bg-muted/70 disabled:text-muted-foreground",
        outline:
          "border-border bg-card text-foreground hover:bg-muted disabled:bg-muted disabled:text-muted-foreground",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground disabled:text-muted-foreground/70",
        destructive: "bg-destructive/10 text-destructive hover:bg-destructive/15 disabled:bg-muted disabled:text-muted-foreground",
        link: "h-auto px-0 text-tm-coral-strong underline-offset-4 hover:underline dark:text-tm-coral",
      },
      size: {
        default: "h-9 gap-1.5 px-4",
        xs: "h-6 gap-1 px-2 text-xs",
        sm: "h-8 gap-1 px-3",
        /** The customer site's standard control: a 44px touch target. */
        touch: "h-11 gap-2 rounded-[14px] px-4",
        /** The primary action on a customer screen. */
        lg: "h-[52px] gap-2 rounded-[14px] px-6 text-[15px] font-bold",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-11 rounded-[14px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Working: a spinner replaces the leading icon and the button is inert. */
  loading?: boolean
  /** Finished: a tick replaces the leading icon. The caller decides how long it stays. */
  done?: boolean
}

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  loading = false,
  done = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button"
  const state = loading ? "loading" : done ? "done" : undefined

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-state={state}
      aria-busy={loading || undefined}
      disabled={asChild ? undefined : disabled || loading}
      aria-disabled={asChild && (disabled || loading) ? true : undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <CircleNotch className="animate-spin" aria-hidden />}
          {!loading && done && <Check weight="bold" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  )
}

export { Button, buttonVariants }
