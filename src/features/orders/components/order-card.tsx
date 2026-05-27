"use client";

import Link from "next/link";
import Image from "next/image";
import {
  PackageIcon,
  TruckIcon,
  AlertTriangleIcon,
  ExternalLinkIcon,
  ArrowRightIcon,
  CheckIcon,
  FileTextIcon,
  LucideIcon,
  MoreVerticalIcon,
  ShoppingBagIcon,
  UserIcon,
} from "lucide-react";
import { OrderStatusBadge } from "./order-status-badge";
import { Button } from "@/components/ui/button";
import type { Order } from "../types";
import {
  Item,
  ItemContent,
  ItemFooter,
  ItemHeader,
} from "@/components/ui/item";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperTitle,
} from "@/components/reui/stepper";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

type BrandConfig = {
  pill: string;
  color: string;
  icon: string | null;
};

function getBrandConfig(platform: string): BrandConfig {
  const p = platform.toLowerCase();
  if (p.includes("amazon"))
    return {
      pill: "bg-amber-50 text-amber-700 border border-amber-200/60",
      color: "#ff9900",
      icon: "/icons/Amazon.svg",
    };
  if (p.includes("ebay"))
    return {
      pill: "bg-blue-50 text-blue-700 border border-blue-200/60",
      color: "#0064d2",
      icon: "/icons/ebay.svg",
    };
  if (p.includes("shein"))
    return {
      pill: "bg-stone-100 text-stone-800 border border-stone-200",
      color: "#111827",
      icon: null,
    };
  if (p.includes("aliexpress"))
    return {
      pill: "bg-rose-50 text-rose-700 border border-rose-200/60",
      color: "#e62e04",
      icon: null,
    };
  return {
    pill: "bg-orange-50 text-orange-700 border border-orange-200/60",
    color: "#ff5c35",
    icon: null,
  };
}

function getPlatformLabel(order: Order): string {
  const meta = order.extraction_metadata?.platform;
  if (meta) return meta;
  const url = order.product_url.toLowerCase();
  if (url.includes("amazon")) return "Amazon";
  if (url.includes("ebay")) return "eBay";
  if (url.includes("shein")) return "SHEIN";
  if (url.includes("microcenter")) return "Microcenter";
  try {
    return new URL(order.product_url).hostname.replace(/^www\./, "");
  } catch {
    return "Store";
  }
}

function getActiveStep(order: Order): number {
  if (order.status === "delivered" || order.status === "completed") return 4;
  if (order.status === "in_transit") return 3;
  if (order.status === "paid" || order.status === "processing") return 2;
  if (order.status === "pending" && order.needs_review) return 1;
  return 0;
}

// ── Stepper ──────────────────────────────────────────────────────────────────

type Step = { label: string; Icon: LucideIcon };

const STEPS: Step[] = [
  { label: "Submitted", Icon: FileTextIcon },
  { label: "Review", Icon: UserIcon },
  { label: "Purchased", Icon: ShoppingBagIcon },
  { label: "Shipping", Icon: TruckIcon },
  { label: "Delivered", Icon: CheckIcon },
];

interface ProgressStepperProps {
  activeStep: number;
  brand: BrandConfig;
}

interface OrderCardProps {
  order: Order;
  variant?: "detailed" | "default";
}

interface OrderRowProps {
  order: Order;
}

const formatOrderDate = (date: Date) =>
  new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const formatOrderPrice = (amount: number = 0) =>
  amount.toLocaleString("en-GH", {
    minimumFractionDigits: 2,
  });

const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const DefaultVariant: React.FC<OrderCardProps> = ({ order }) => {
  return (
    <Item className="rounded-xl overflow-hidden bg-white">
      {/* Header — hidden on mobile */}
      <ItemHeader className="hidden sm:flex items-center justify-between gap-4 px-5 py-3.5 border-b border-stone-100">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-xs text-stone-400 mb-0.5">Order Date</p>
            <p className="text-sm font-semibold text-stone-800">
              {formatOrderDate(new Date(order.created_at))}
            </p>
          </div>
          <div>
            <p className="text-xs text-stone-400 mb-0.5">Total</p>
            <p className="text-sm font-semibold text-stone-800">
              GHS {formatOrderPrice(order.pricing?.total_ghs)}
            </p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>
        <Button
          size="sm"
          asChild
          variant="outline"
          className="shadow-none shrink-0"
        >
          <Link href={`/app/orders/${order.id}`}>View Order</Link>
        </Button>
      </ItemHeader>

      {/* Product row */}
      <ItemContent className="flex flex-row gap-4 px-5 py-4">
        <div className="shrink-0 size-20 rounded-lg border border-stone-100 bg-stone-50 overflow-hidden flex items-center justify-center p-1.5">
          {order.product_image_url ? (
            <Image
              src={order.product_image_url}
              alt={order.product_name}
              width={80}
              height={80}
              className="object-contain w-full h-full"
            />
          ) : (
            <PackageIcon className="size-7 text-stone-300" />
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-between gap-3">
          <p className="font-semibold text-stone-900 line-clamp-2 leading-snug text-sm">
            {order.product_name}
          </p>
          <div className="flex items-center gap-3">
            {/* Mobile: show status + view details */}
            <span className="sm:hidden">
              <OrderStatusBadge status={order.status} />
            </span>
            <Link
              href={`/app/orders/${order.id}`}
              className="sm:hidden flex items-center gap-1 text-xs text-rose-500 hover:text-rose-600 transition-colors font-medium"
            >
              <ArrowRightIcon className="size-3" />
              View details
            </Link>
            {/* Desktop: view product link */}
            <Link
              href={order.product_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1 text-xs text-stone-400 hover:text-rose-500 transition-colors"
            >
              <ExternalLinkIcon className="size-3" />
              View Product
            </Link>
          </div>
        </div>
      </ItemContent>

      <ItemFooter>
        {/* Status banners */}
        {order.needs_review && order.status === "pending" ? (
          <div className="flex items-center gap-2 px-5 py-2.5 bg-amber-50 border-b border-amber-100 text-xs text-amber-700 font-medium">
            <AlertTriangleIcon className="size-3.5 shrink-0" />
            Pending admin review
          </div>
        ) : order.tracking_number ? (
          <div className="flex items-center gap-2 px-5 py-2.5 bg-indigo-50 border-b border-indigo-100 text-xs text-indigo-700 font-medium">
            <TruckIcon className="size-3.5 shrink-0" />
            Tracking: {order.tracking_number}
            {order.carrier && (
              <span className="text-indigo-400 font-normal">
                via {order.carrier}
              </span>
            )}
          </div>
        ) : null}
      </ItemFooter>
    </Item>
  );
};

function ProgressStepper({ activeStep, brand }: ProgressStepperProps) {
  const activeLabel = STEPS[activeStep]?.label ?? "";

  return (
    <div
      className="w-full"
      style={{ "--stepper-brand": brand.color } as React.CSSProperties}
    >
      <Stepper
        value={activeStep + 1}
        indicators={{
          completed: <CheckIcon className="size-4" strokeWidth={3} />,
        }}
      >
        <div className="relative w-full">
          {/* Background track */}
          <div className="absolute inset-x-4 top-4 h-0.5 bg-stone-100" />
          {/* Active track */}
          {activeStep > 0 && (
            <div
              className="absolute left-4 top-4 h-0.5 transition-all duration-500"
              style={{
                width: `calc((100% - 2rem) * ${activeStep / (STEPS.length - 1)})`,
                backgroundColor: brand.color,
              }}
            />
          )}
          <div className="relative flex w-full justify-between">
            {STEPS.map((step, idx) => {
              const StepIcon = step.Icon;
              return (
                <StepperItem
                  key={step.label}
                  step={idx + 1}
                  className="flex-col items-center gap-1.5"
                  style={{ flex: "none" }}
                >
                  <StepperIndicator
                    className={cn(
                      "size-8 text-white",
                      "data-[state=active]:bg-(--stepper-brand) data-[state=completed]:bg-(--stepper-brand)",
                      "data-[state=inactive]:bg-stone-100 data-[state=inactive]:text-stone-400",
                    )}
                  >
                    <StepIcon className="size-3.5" aria-hidden="true" />
                  </StepperIndicator>
                  <StepperTitle
                    className={cn(
                      "hidden text-[9.5px] font-bold sm:block",
                      "data-[state=active]:text-(--stepper-brand)",
                      "data-[state=completed]:text-stone-600",
                      "data-[state=inactive]:text-stone-400",
                    )}
                  >
                    {step.label}
                  </StepperTitle>
                </StepperItem>
              );
            })}
          </div>
        </div>
      </Stepper>
      {/* Mobile compact step summary */}
      <p className="mt-1.5 text-xs text-stone-400 sm:hidden">
        Step {activeStep + 1} of {STEPS.length}&nbsp;&mdash;&nbsp;
        <span style={{ color: brand.color }} className="font-semibold">
          {activeLabel}
        </span>
      </p>
    </div>
  );
}

export function DetailedVariant({ order }: OrderRowProps) {
  const platform = getPlatformLabel(order);
  const brand = getBrandConfig(platform);
  const activeStep = getActiveStep(order);

  const dateStr = DATE_FORMATTER.format(new Date(order.created_at));
  const total = (
    order.admin_total_ghs ??
    order.pricing?.total_ghs ??
    0
  ).toLocaleString("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <Card className="flex flex-col gap-4 rounded-2xl border-2 border-neutral-100 bg-white p-5 transition-shadow lg:flex-row md:items-center">
      {/* Product info */}
      <div className="shrink-0 flex items-center justify-center size-20 overflow-hidden">
        {order?.product_image_url ? (
          <Image
            width={64}
            height={64}
            src={order.product_image_url}
            alt={order.product_name}
            className="h-full w-full rounded-lg object-contain"
          />
        ) : (
          <div className="p-1 size-full flex flex-col items-center justify-center rounded-lg border border-stone-100 bg-stone-50">
            <ShoppingBagIcon
              className="size-6 text-stone-300"
              aria-hidden="true"
            />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <span
            className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${brand.pill}`}
          >
            {platform}
          </span>
        </div>

        <h3 className="line-clamp-2 text-[13.5px] font-bold leading-tight text-stone-900">
          {order.product_name}
        </h3>

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[11px] text-stone-400">{dateStr}</span>
            <span className="text-[11px] text-stone-300" aria-hidden="true">
              ·
            </span>
            <OrderStatusBadge status={order.status} />
          </div>
          <span className="text-[12px] font-bold text-stone-900 xl:hidden">
            GHS {total}
          </span>
        </div>
      </div>

      {/* Total — desktop only */}
      <div className="hidden shrink-0 flex-col gap-1 border-l border-stone-50 px-5 xl:flex">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-stone-400">
          Total
        </span>
        <span className="text-[13.5px] font-black text-stone-900">
          GHS {total}
        </span>
      </div>

      {/* Progress stepper */}
      <div className="shrink-0 min-w-0 flex-1 xl:max-w-sm xl:px-4 hidden md:block">
        <ProgressStepper activeStep={activeStep} brand={brand} />
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-2 border-t border-stone-50 pt-3 xl:border-t-0 xl:pt-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-stone-200 text-stone-500 transition-colors hover:border-stone-300 hover:text-stone-700"
              aria-label="More actions"
            >
              <MoreVerticalIcon className="size-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-full rounded-xl border border-stone-100 shadow-md"
          >
            <DropdownMenuItem asChild>
              <Link
                href={`/app/orders/${order.id}`}
                className="flex cursor-pointer items-center gap-2 py-2"
              >
                <span>View Details</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href={order.product_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex cursor-pointer items-center gap-2 py-2"
              >
                <span>View product</span>
                <ExternalLinkIcon className="size-4 text-stone-500" />
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}

function MobileVariant({ order }: OrderRowProps) {
  const platform = getPlatformLabel(order);
  const brand = getBrandConfig(platform);

  const dateStr = DATE_FORMATTER.format(new Date(order.created_at));
  const total = (
    order.admin_total_ghs ??
    order.pricing?.total_ghs ??
    0
  ).toLocaleString("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <Link
      href={`/app/orders/${order.id}`}
      className="flex items-center gap-4 rounded-2xl border border-stone-100 bg-white p-3.5 shadow-[0_1px_6px_rgba(0,0,0,0.04)] transition-all active:scale-[0.985] active:bg-stone-50"
    >
      {/* Image */}
      <div className="shrink-0 flex size-14 h-full items-center justify-center overflow-hidden">
        {order.product_image_url ? (
          <Image
            src={order.product_image_url}
            alt={order.product_name}
            width={56}
            height={56}
            className="h-full w-full object-contain rounded-lg"
          />
        ) : (
          <div className="p-1 flex-1 size-full flex flex-col items-center justify-center rounded-lg border border-stone-100 bg-stone-50">
            <ShoppingBagIcon
              className="size-6 text-stone-300"
              aria-hidden="true"
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${brand.pill}`}>
            {platform}
          </span>
          <span className="shrink-0 text-[12px] font-bold text-stone-900">
            GHS {total}
          </span>
        </div>
        <p className="line-clamp-1 text-[13px] font-semibold leading-snug text-stone-900">
          {order.product_name}
        </p>
        <div className="flex items-center gap-2">
          <OrderStatusBadge status={order.status} />
          <span className="text-[10px] text-stone-400">{dateStr}</span>
        </div>
      </div>

      {/* Chevron */}
      <ArrowRightIcon className="shrink-0 size-4 text-stone-300" aria-hidden="true" />
    </Link>
  );
}

export function MobileOrderCard({ order }: OrderRowProps) {
  return <MobileVariant order={order} />;
}

export function OrderCard({ order, variant = "default" }: OrderCardProps) {
  if (variant === "detailed") {
    return <DetailedVariant order={order} />;
  }
  return <DefaultVariant order={order} />;
}
