"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, LinkIcon } from "lucide-react";
import {
  extractProductSchema,
  type ExtractionSchemaType,
} from "@/features/extraction/schema";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { FEATURE_BADGES } from "@/config/ui";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";

interface HeroGridSectionProps {
  usdToGhs: number;
}


export default function HeroGridSection({ usdToGhs }: HeroGridSectionProps) {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ExtractionSchemaType>({
    resolver: zodResolver(extractProductSchema),
    mode: "onSubmit",
  });

  const onSubmit = async (data: ExtractionSchemaType) => {
    router.push(`/app/orders/new?url=${encodeURIComponent(data.product_url)}`);
  };

  const leftInitial = prefersReducedMotion
    ? { opacity: 0 }
    : { opacity: 0, y: 20 };
  const rightInitial = prefersReducedMotion
    ? { opacity: 0 }
    : { opacity: 0, x: 20 };

  return (
    <section className="bg-white py-20 sm:py-24 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-20">
          {/* Left content */}
          <motion.div
            initial={leftInitial}
            animate={{ opacity: 1, y: 0, x: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center gap-9 text-center lg:items-start lg:gap-7 lg:text-left"
          >
            {/* Live rate badge */}
            <div>
              <span className="inline-flex items-center gap-2.5 rounded-full border border-stone-200 bg-stone-50 px-3.5 py-1.5 text-xs font-medium text-stone-700">
                <span
                  className="relative flex h-2 w-2 shrink-0"
                  aria-hidden="true"
                >
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span>
                  $1 = GH₵{usdToGhs.toFixed(2)}{" "}
                  <span className="text-stone-500">live</span>
                </span>
                <span className="h-3 w-px bg-stone-300" aria-hidden="true" />
                <span className="text-stone-500">Built for Ghana</span>
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl font-black leading-[1.05] tracking-tight text-stone-950 sm:text-5xl lg:text-6xl">
              Shop the world.
              <br />
              <span className="text-transparent bg-clip-text bg-linear-to-r from-orange-500 to-rose-500 overflow-hidden">
                Pay in cedis.
              </span>
            </h1>

            {/* Subtext */}
            <p className="max-w-xl text-base leading-relaxed text-stone-600 sm:text-lg">
              Paste any product link from Amazon, eBay, or SHEIN. We buy it,
              ship it, and deliver to your door — you pay in GHS.
            </p>

            {/* URL input form */}
            <form
              onSubmit={handleSubmit(onSubmit)}
              noValidate
              className="w-full flex flex-col gap-2 text-left"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <InputGroup className="flex-1 h-12 border-stone-200 bg-white shadow-sm">
                  <InputGroupAddon align="inline-start">
                    <LinkIcon
                      className="size-5 text-stone-400"
                      aria-hidden="true"
                    />
                  </InputGroupAddon>
                  <label htmlFor="hero-product-url" className="sr-only">
                    Product URL
                  </label>
                  <InputGroupInput
                    id="hero-product-url"
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    placeholder="Paste a product URL from Amazon, eBay or SHEIN"
                    aria-invalid={errors.product_url ? "true" : "false"}
                    aria-describedby={
                      errors.product_url
                        ? "hero-product-url-error"
                        : "hero-product-url-helper"
                    }
                    disabled={isSubmitting}
                    className="text-sm text-stone-900"
                    {...register("product_url")}
                  />
                </InputGroup>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  aria-busy={isSubmitting}
                  className="h-12 w-full rounded-full sm:w-auto sm:rounded-full bg-linear-to-br from-amber-500 to-rose-500 px-6 text-sm font-semibold text-white shadow-[0_2px_8px_-1px_rgba(255,92,53,0.35)] hover:opacity-95 active:scale-[0.98] transition-all"
                >
                  {isSubmitting ? (
                    <Spinner className="size-4" />
                  ) : (
                    <>
                      <span>Get a quote</span>
                      <ArrowRightIcon className="size-4" aria-hidden="true" />
                    </>
                  )}
                </Button>
              </div>

              {errors.product_url && (
                <p
                  id="hero-product-url-error"
                  role="alert"
                  className="px-1 text-xs font-medium text-red-600"
                >
                  {errors.product_url.message}
                </p>
              )}
            </form>

            {/* Feature badges */}
            <div className="w-full grid grid-cols-2 gap-x-4 gap-y-3 pt-2 text-left sm:grid-cols-3">
              {FEATURE_BADGES.map(({ label, Icon, color, bg }) => (
                <div key={label} className="flex items-center gap-2.5">
                  <div
                    className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${bg} ${color}`}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </div>
                  <span className="text-xs font-semibold leading-tight tracking-tight text-stone-600">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right image grid (desktop only) */}
          <div className="hidden lg:block">
            <motion.div
              initial={rightInitial}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{
                duration: 0.7,
                delay: 0.15,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="relative"
            >
              <div className="grid grid-cols-2 gap-3">
                {/* Column 1 */}
                <div className="space-y-3">
                  {/* Shopping image */}
                  <div className="relative h-64 overflow-hidden rounded-2xl">
                    <Image
                      src="/images/shopping.jpg"
                      alt="Browsing international online stores"
                      fill
                      sizes="(min-width: 1024px) 25vw, 50vw"
                      className="object-cover"
                    />
                    <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 shadow-md backdrop-blur-sm">
                      <Image
                        src="/icons/amazon.svg"
                        alt="Amazon"
                        width={56}
                        height={16}
                        className="h-4 w-auto"
                      />
                    </div>
                  </div>

                  {/* Mobile pay image */}
                  <div className="relative h-44 overflow-hidden rounded-2xl">
                    <Image
                      src="/images/mobile-pay.jpg"
                      alt="Paying with mobile money in Ghana"
                      fill
                      sizes="(min-width: 1024px) 25vw, 50vw"
                      className="object-cover"
                    />
                    <div className="absolute right-3 top-3 rounded-xl bg-white/95 px-3 py-2 shadow-md backdrop-blur-sm">
                      <div className="text-sm font-bold text-stone-900">
                        GH₵{usdToGhs.toFixed(2)}
                      </div>
                      <div className="text-[10px] font-medium text-stone-500">
                        per $1 today
                      </div>
                    </div>
                  </div>
                </div>

                {/* Column 2 — staggered offset */}
                <div className="space-y-3 pt-5">
                  {/* Boxes image */}
                  <div className="relative h-44 overflow-hidden rounded-2xl">
                    <Image
                      src="/images/boxes.jpg"
                      alt="Packages prepared for international shipment"
                      fill
                      sizes="(min-width: 1024px) 25vw, 50vw"
                      className="object-cover"
                    />
                    <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 shadow-md backdrop-blur-sm">
                      <Image
                        src="/icons/ebay.svg"
                        alt="eBay"
                        width={48}
                        height={14}
                        className="h-3.5 w-auto"
                      />
                    </div>
                  </div>

                  {/* Delivery image */}
                  <div className="relative h-64 overflow-hidden rounded-2xl">
                    <Image
                      src="/images/delivery.jpg"
                      alt="Local courier delivering to a Ghanaian customer"
                      fill
                      sizes="(min-width: 1024px) 25vw, 50vw"
                      className="object-cover"
                    />
                    <div className="absolute bottom-3 left-3 rounded-xl bg-white/95 px-3 py-2 shadow-md backdrop-blur-sm">
                      <div className="text-sm font-bold text-stone-900">
                        2,400+
                      </div>
                      <div className="text-[10px] font-medium text-stone-500">
                        packages delivered
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

      </div>
    </section>
  );
}
