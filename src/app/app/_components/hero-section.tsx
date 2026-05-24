"use client";

import Image from "next/image";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, useReducedMotion } from "motion/react";
import { LinkIcon, SparklesIcon, ZapIcon, ShieldCheckIcon, GlobeIcon } from "lucide-react";
import {
  extractProductSchema,
  type ExtractionSchemaType,
} from "@/features/extraction/schema";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

const SUPPORTED_STORES = [
  {
    id: "amazon",
    name: "Amazon",
    logo: "/icons/Amazon.svg",
    url: "https://www.amazon.com",
  },
  {
    id: "ebay",
    name: "eBay",
    logo: "/icons/ebay.svg",
    url: "https://www.ebay.com",
  },
  {
    id: "shein",
    name: "SHEIN",
    logo: null,
    url: "https://www.shein.com",
    textClassName: "text-stone-900",
  },
  {
    id: "microcenter",
    name: "Microcenter",
    logo: null,
    url: "https://www.microcenter.com",
    textClassName: "text-stone-700",
  },
] as const;

const FEATURE_BADGES = [
  { label: "Fast Processing", Icon: ZapIcon, color: "text-orange-500", bg: "bg-orange-50" },
  { label: "Secure & Safe", Icon: ShieldCheckIcon, color: "text-orange-500", bg: "bg-orange-50" },
  { label: "Worldwide Shipping", Icon: GlobeIcon, color: "text-purple-500", bg: "bg-purple-50" },
] as const;

interface HeroSectionProps {
  onSubmit: (url: string) => void;
  isLoading?: boolean;
}

export function HeroSection({ onSubmit, isLoading = false }: HeroSectionProps) {
  const shouldReduceMotion = useReducedMotion();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ExtractionSchemaType>({
    resolver: zodResolver(extractProductSchema),
  });

  const busy = isLoading || isSubmitting;

  return (
    <section
      aria-labelledby="dashboard-hero-heading"
      className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-12"
    >
      {/* Left: heading + supported stores */}
      <div className="space-y-6">
        <div className="space-y-3">
          <h1
            id="dashboard-hero-heading"
            className="text-4xl font-black tracking-tight text-stone-900 leading-[1.05] md:text-5xl"
          >
            Import Products
            <br />
            <span className="bg-linear-to-r from-rose-500 to-amber-500 bg-clip-text text-transparent">
              Worldwide 🌐
            </span>
          </h1>
          <p className="max-w-lg text-base leading-relaxed text-stone-500">
            Paste any product link from Amazon, eBay, SHEIN and more. We&apos;ll handle the rest.
          </p>
        </div>

        <div className="space-y-3">
          <span className="block text-[11px] font-bold uppercase tracking-widest text-stone-400">
            Supported Stores
          </span>
          <div className="flex flex-wrap items-center gap-2.5">
            {SUPPORTED_STORES.map((store) => (
              <Link
                key={store.id}
                href={store.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Visit ${store.name}`}
                className="flex h-11 min-w-20 items-center justify-center rounded-xl border border-stone-100 bg-white px-3 shadow-xs transition-all hover:border-stone-200 hover:shadow-sm"
              >
                {store.logo ? (
                  <Image
                    src={store.logo}
                    alt={store.name}
                    width={64}
                    height={20}
                    className="h-5 w-auto object-contain"
                  />
                ) : (
                  <span className={`text-sm font-bold ${store.textClassName}`}>
                    {store.name}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Right: extraction card */}
      <motion.div
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-3xl border border-rose-100/60 bg-white p-6 shadow-rose-500/10 shadow-lg"
      >
        <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-rose-100/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 -left-12 size-40 rounded-full bg-orange-100/20 blur-3xl" />

        <div className="relative z-10 space-y-5">
          <form
            onSubmit={handleSubmit((d) => onSubmit(d.product_url))}
            className="space-y-2"
            noValidate
          >
            <div className="flex flex-col gap-3 rounded-2xl border border-stone-100 bg-stone-50/50 p-1.5 shadow-inner transition-all focus-within:border-orange-500/20 focus-within:bg-white focus-within:ring-4 focus-within:ring-[#ff5c35]/5 sm:flex-row">
              <div className="flex min-w-0 flex-1 items-start gap-3 px-3 py-2.5">
                <LinkIcon
                  className="mt-0.5 size-5 shrink-0 text-stone-400"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <input
                    {...register("product_url")}
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Paste product URL here..."
                    disabled={busy}
                    aria-invalid={!!errors.product_url}
                    aria-describedby={
                      errors.product_url ? "hero-url-error" : undefined
                    }
                    className="w-full border-0 bg-transparent p-0 text-sm font-medium text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-0 disabled:opacity-60"
                  />
                  <span className="mt-1 block text-[11px] text-stone-400">
                    Example: https://www.amazon.com/dp/B09XYZ...
                  </span>
                </div>
              </div>
              <Button
                type="submit"
                disabled={busy}
                aria-busy={busy}
                className="shrink-0 rounded-xl bg-linear-to-r from-amber-500 to-rose-500 px-6 py-3.5 text-sm font-semibold text-white shadow-md shadow-[#ff5c35]/15 hover:opacity-95 active:scale-[0.98]"
              >
                {busy ? (
                  <>
                    <Spinner className="size-4" />
                    <span>Extracting...</span>
                  </>
                ) : (
                  <>
                    <SparklesIcon className="size-4" />
                    <span>Extract Product</span>
                  </>
                )}
              </Button>
            </div>
            {errors.product_url && (
              <p
                id="hero-url-error"
                role="alert"
                className="pl-2 text-xs font-medium text-red-500"
              >
                {errors.product_url.message}
              </p>
            )}
          </form>

          <div className="grid grid-cols-3 gap-2 border-t border-stone-100 pt-4">
            {FEATURE_BADGES.map(({ label, Icon, color, bg }) => (
              <div key={label} className="flex items-center gap-2">
                <div
                  className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${bg} ${color}`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </div>
                <span className="text-xs font-semibold tracking-tight text-stone-600">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </section>
  );
}
