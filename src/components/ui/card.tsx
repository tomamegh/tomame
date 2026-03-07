import * as React from "react"

import { cn } from "@/lib/utils"

const cardVariants = {
  default:
    'bg-white/80 backdrop-blur-sm border border-stone-200/40 shadow-[0_4px_24px_-4px_rgba(120,113,108,0.08)]',
  gradient:
    'bg-gradient-to-br from-rose-50/60 via-orange-50/40 to-amber-50/60 border border-rose-100/30 shadow-[0_4px_24px_-4px_rgba(244,63,94,0.06)]',
  elevated:
    'bg-white border border-stone-200/40 shadow-[0_8px_40px_-4px_rgba(120,113,108,0.12),0_4px_16px_-4px_rgba(120,113,108,0.08)]',
} as const;

function Card({ className, variant="default", ...props }: React.ComponentProps<"div"> & {
  size?: "default" | "sm";
  variant?: keyof typeof cardVariants;
}){
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm",
        cardVariants[variant],
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
