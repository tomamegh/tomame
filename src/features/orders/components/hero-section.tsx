"use client";

import Image from "next/image";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, useReducedMotion } from "motion/react";
import { LinkIcon, SparklesIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { SUPPORTED_STORES } from "@/config/ui";
import {
  extractProductSchema,
  type ExtractionSchemaType,
} from "@/features/extraction/schema";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";

interface HeroSectionProps {
  isLoading?: boolean;
}

export function HeroSection({ isLoading = false }: HeroSectionProps) {
  const shouldReduceMotion = useReducedMotion();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ExtractionSchemaType>({
    resolver: zodResolver(extractProductSchema),
  });

  const router = useRouter();
  const busy = isLoading || isSubmitting;

  const onSubmit = (url: string) => {
    router.push(`/app/orders/new?url=${encodeURIComponent(url)}`);
  };

  return (
    <section aria-labelledby="dashboard-hero-heading">
      <motion.div
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative rounded-3xl border border-rose-100/60 bg-white p-6 shadow"
      >
        <div className="relative z-10 space-y-5">
          <form
            onSubmit={handleSubmit((d) => onSubmit(d.product_url))}
            className="space-y-2"
            noValidate
          >
            <InputGroup className="h-auto min-h-14 border-stone-200 bg-stone-100 shadow-inner pl-3">
              <InputGroupAddon align="inline-start">
                <LinkIcon
                  className="size-5 text-stone-400"
                  aria-hidden="true"
                />
              </InputGroupAddon>
              <InputGroupInput
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
                className="text-sm font-medium"
                {...register("product_url")}
              />
              <InputGroupAddon align="inline-end" className="h-full">
                <Button
                  type="submit"
                  disabled={busy}
                  aria-busy={busy}
                  className="h-full bg-linear-to-r rounded-lg from-amber-500 to-rose-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#ff5c35]/15 hover:opacity-95 active:scale-[0.98]"
                >
                  <>
                    <SparklesIcon className="size-4" />
                    <span className="hidden md:block">Extract Product</span>
                  </>
                </Button>
              </InputGroupAddon>
            </InputGroup>
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

          <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-none [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible sm:pb-0">
            {SUPPORTED_STORES.map((store) => (
              <Link
                key={store.id}
                href={store.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Visit ${store.name}`}
                className="flex h-10 shrink-0 items-center justify-center rounded-xl border border-stone-100 bg-white px-4 shadow-xs transition-all hover:border-stone-200 hover:shadow-sm"
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
      </motion.div>
    </section>
  );
}
