import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "rounded-xl border border-transparent text-sm font-semibold focus-visible:ring-3 focus-visible:ring-rose-400/30 [&_svg:not([class*='size-'])]:size-4 inline-flex items-center justify-center whitespace-nowrap transition-all duration-300 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none shrink-0 [&_svg]:shrink-0 outline-none group/button select-none cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        primary:
          "bg-gradient-to-r from-rose-500 to-amber-500 text-white shadow-[0_4px_14px_-2px_rgba(244,63,94,0.35)] hover:shadow-[0_6px_20px_-2px_rgba(244,63,94,0.45)] hover:translate-y-[-1px]",
        secondary:
          "bg-stone-100 text-stone-700 hover:bg-stone-200 shadow-[0_2px_8px_-2px_rgba(120,113,108,0.1)]",
        outline: "border-stone-200 bg-white hover:bg-stone-50 text-stone-700 shadow-xs",
        ghost: "hover:bg-stone-100 text-stone-600",
        destructive: "bg-red-50 hover:bg-red-100 text-red-600",
        link: "text-rose-500 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 gap-1.5 px-4",
        xs: "h-6 gap-1 px-2 text-xs",
        sm: "h-8 gap-1 px-3",
        lg: "h-11 gap-2 px-6 text-base",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
