"use client";

import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, useReducedMotion } from "motion/react";
import {
  ExtractionSchemaType,
  extractProductSchema,
} from "@/features/extraction/schema";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ArrowUpRightIcon, LinkIcon, ScanSearchIcon } from "lucide-react";
import { Field } from "@/components/ui/field";
import { useIsMobile } from "@/hooks/use-mobile";
import Link from "next/link";

const SUPPORTED_STORES = [
  {
    id: "amazon",
    name: "Amazon",
    logo: "/icons/Amazon.svg",
    url: "https://www.amazon.com",
    width: 80,
    height: 24,
  },
  {
    id: "ebay",
    name: "eBay",
    logo: "/icons/ebay.svg",
    url: "https://www.ebay.com",
    width: 50,
    height: 24,
  },
  {
    id: "shein",
    name: "SHEIN",
    logo: null,
    url: "https://www.shein.com",
    width: 0,
    height: 0,
  },
  {
    id: "microcenter",
    name: "Microcenter",
    logo: null,
    url: "https://www.microcenter.com",
    width: 0,
    height: 0,
  },
];

interface ExtractionFormProps {
  onSubmit: (url: string) => void;
  isLoading: boolean;
}

const ExtractionInput: React.FC<ExtractionFormProps> = ({
  isLoading,
  onSubmit,
}) => {
  const {
    handleSubmit,
    register,
    formState: { errors },
  } = useForm<ExtractionSchemaType>({
    resolver: zodResolver(extractProductSchema),
  });

  const isMobile = useIsMobile();

  return (
    <div>
      <Field orientation={isMobile ? "responsive" : "horizontal"}>
        <InputGroup className="min-h-11 h-fit md:pl-2">
          <InputGroupInput
            {...register("product_url")}
            type="url"
            placeholder="https://amazon.com/dp/B09XYZ..."
            className={`soft-input`}
            disabled={isLoading}
            aria-invalid={!!errors.product_url}
          />
          <InputGroupAddon>
            <LinkIcon className="size-4 text-stone-400" />
          </InputGroupAddon>

          <InputGroupAddon align={"inline-end"} className="hidden md:flex">
            <Button
              type="submit"
              variant="primary"
              size="default"
              onClick={handleSubmit((data) => onSubmit(data.product_url))}
              disabled={isLoading}
              className="shrink-0 gap-2"
            >
              {isLoading ? (
                <>
                  <Spinner />
                  Extracting...
                </>
              ) : (
                <>
                  <ScanSearchIcon className="size-4" />
                  Extract
                </>
              )}
            </Button>
          </InputGroupAddon>
        </InputGroup>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          onClick={handleSubmit((data) => onSubmit(data.product_url))}
          disabled={isLoading}
          className="shrink-0 gap-2 md:hidden"
        >
          {isLoading ? (
            <>
              <Spinner />
              Extracting...
            </>
          ) : (
            <>
              <ScanSearchIcon className="size-4" />
              Extract
            </>
          )}
        </Button>
      </Field>
      {errors.product_url && (
        <p className="text-sm text-destructive" role="alert">
          {errors.product_url.message}
        </p>
      )}
    </div>
  );
};

function SupportedStores() {
  const shouldReduceMotion = useReducedMotion();

  const container = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: shouldReduceMotion
        ? { duration: 0 }
        : { staggerChildren: 0.06, delayChildren: 0.05 },
    },
  };

  const item = {
    hidden: shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const },
    },
  };

  return (
    <div className="w-full">
      {/* Label row with hairline divider */}
      <div className="flex items-center gap-3 mb-3">
        <span className="inline-flex items-center gap-1.5">
          <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-[0.14em]">
            Supported stores
          </p>
        </span>
      </div>

      <motion.ul
        role="list"
        variants={container}
        initial="hidden"
        animate="visible"
        className="flex flex-wrap items-center gap-2 sm:gap-4"
      >
        {SUPPORTED_STORES.map((store) => (
          <motion.li
            key={store.id}
            variants={item}
            className="list-none h-10 border border-neutral-200 rounded-xl"
          >
            <Link
              href={store.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Visit ${store.name} website`}
              className="relative flex h-full items-center gap-2 px-3.5"
            >
              {store.logo ? (
                <Image
                  src={store.logo}
                  alt={store.name}
                  width={store.width}
                  height={store.height}
                  className="object-contain"
                  style={{
                    // height: store.id === "amazon" ? 18 : 22,
                    height: 22,
                    width: "auto",
                  }}
                />
              ) : (
                <span className="text-sm font-semibold text-stone-700 leading-none">
                  {store.name}
                </span>
              )}

              <ArrowUpRightIcon
                aria-hidden
                className="size-3.5 text-stone-300"
              />
            </Link>
          </motion.li>
        ))}
      </motion.ul>
    </div>
  );
}

export function ExtractionForm({ onSubmit, isLoading }: ExtractionFormProps) {
  return (
    <Card className="rounded-2xl bg-white/80 backdrop-blur-sm">
      {/* Header */}
      <CardHeader>
        <CardTitle className="text-lg font-bold text-stone-800">
          Order Any Product
        </CardTitle>
        <CardDescription className="text-sm text-stone-500 -mt-2">
          Paste a product link from any supported store and we&apos;ll handle
          the rest.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <ExtractionInput onSubmit={onSubmit} isLoading={isLoading} />
      </CardContent>

      {/* Supported stores */}
      <CardFooter className="flex-col items-start mt-2">
        <SupportedStores />
      </CardFooter>
    </Card>
  );
}
