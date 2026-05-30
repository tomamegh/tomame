"use client";

import Link from "next/link";
import { motion, type Variants, useReducedMotion } from "motion/react";
import { ChevronRightIcon, FileTextIcon } from "lucide-react";
import type { PolicyRow } from "@/features/policies/types";
import { cn } from "@/lib/utils";

const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
};

function formatUpdated(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface PoliciesListProps {
  policies: PolicyRow[];
}

export function PoliciesList({ policies }: PoliciesListProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.ul
      initial={reduceMotion ? false : "hidden"}
      animate="show"
      variants={listVariants}
      className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xs"
    >
      {policies.map((policy) => (
        <motion.li key={policy.slug} variants={itemVariants}>
          <Link
            href={`/admin/policies/${policy.slug}`}
            className="group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-stone-50 focus-visible:bg-stone-50 focus-visible:outline-none sm:px-5"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-500 transition-colors group-hover:bg-white group-hover:text-stone-700">
              <FileTextIcon className="size-5" />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-stone-800">
                  {policy.label}
                </p>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    policy.is_published
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-500",
                  )}
                >
                  {policy.is_published ? "Published" : "Draft"}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-stone-400">
                /{policy.slug} · Updated {formatUpdated(policy.last_updated)}
              </p>
            </div>

            <ChevronRightIcon className="size-4 shrink-0 text-stone-300 transition-colors group-hover:text-stone-500" />
          </Link>
        </motion.li>
      ))}
    </motion.ul>
  );
}
