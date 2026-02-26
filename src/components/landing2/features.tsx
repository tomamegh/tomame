"use client";
import {
  ChartBarIcon,
  CheckCheckIcon,
  LinkIcon,
  PackageIcon,
  RocketIcon,
  RouteIcon,
} from "lucide-react";
import { motion, Variants } from "motion/react";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "../ui/item";

// const FEATURES = [
//   {
//     icon: LinkIcon,
//     title: "Intelligent Extraction",
//     description:
//       "Paste any product link and our engine extracts titles, images, prices, and specs automatically.",
//   },
//   {
//     icon: PackageIcon,
//     title: "Transparent Pricing",
//     description:
//       "See a full cost breakdown — product, shipping, freight, taxes, and fees — before you commit.",
//   },
//   {
//     icon: RocketIcon,
//     title: "Global Fulfillment",
//     description:
//       "We source from 50+ countries with competitive carrier rates and reliable delivery timelines.",
//   },
//   {
//     icon: RouteIcon,
//     title: "Live Order Tracking",
//     description:
//       "Follow every order from purchase to doorstep with real-time status updates and notifications.",
//   },
// ];

const FEATURES = [
  {
    icon: LinkIcon,
    title: "Intelligent Product Extraction",
    description:
      "Paste any product link and our engine instantly pulls structured data — titles, high-resolution images, pricing, variants, and technical specifications.",
    highlights: [
      "Supports major global marketplaces",
      "Auto-detects variants and options",
      "Handles complex product pages",
    ],
  },
  {
    icon: PackageIcon,
    title: "Transparent, Upfront Pricing",
    description:
      "Get a complete landed cost breakdown before placing your order. No surprises. No hidden markups.",
    highlights: [
      "Product cost",
      "International shipping & freight",
      "Customs duties and local taxes",
    ],
  },
  {
    icon: RocketIcon,
    title: "Optimized Global Fulfillment",
    description:
      "Access a worldwide sourcing and logistics network across 50+ countries, optimized for speed and cost efficiency.",
    highlights: [
      "Negotiated carrier rates",
      "Reliable delivery timelines",
      "Smart routing optimization",
    ],
  },
  {
    icon: RouteIcon,
    title: "End-to-End Order Visibility",
    description:
      "Track every stage of your order lifecycle — from supplier confirmation to last-mile delivery.",
    highlights: [
      "Real-time tracking updates",
      "Automated notifications",
      "Centralized order dashboard",
    ],
  },
];

export default function LadningFeaturesSection() {
  return (
    <section className="py-20 sm:py-28 lg:py-32 bg-stone-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 sm:mb-16">
          <p className="inline-block px-3 py-1 mb-3 rounded-full bg-primary/20 text-primary text-xs font-semibold tracking-wide uppercase">
            Features
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-stone-900 mb-4">
            Everything you need to source smarter
          </h2>
          <p className="text-base sm:text-lg text-stone-500 max-w-2xl mx-auto">
            A complete toolkit that replaces scattered workflows with one
            streamlined platform.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6 lg:[&>*:nth-child(4n+1)]:col-span-3 lg:[&>*:nth-child(4n+1)]:col-start-1 lg:[&>*:nth-child(4n+2)]:col-span-1 lg:[&>*:nth-child(4n+2)]:col-start-4 lg:[&>*:nth-child(4n+3)]:col-span-1 lg:[&>*:nth-child(4n+3)]:col-start-1 lg:[&>*:nth-child(4n+4)]:col-span-3 lg:[&>*:nth-child(4n+4)]:col-start-2">
          {FEATURES.map((f, i) => {
            return (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.2 }}
                key={i}
                className={`group relative rounded-2xl border border-stone-200/60 bg-white hover:bg-primary hover:border-white p-6 sm:p-7 transition-all duration-500 hover:-translate-y-1`}
              >
                <div className="w-12 h-12 rounded-xl hover:bg-white flex items-center justify-center text-2xl mb-5 group-hover:bg-white bg-stone-100 transition-all duration-500">
                  <f.icon className="stroke-stone-800" />
                </div>
                <h3 className="font-bold text-lg text-stone-900 mb-2 group-hover:text-white transition-all duration-500">
                  {f.title}
                </h3>
                <p className="text-stone-500 text-sm leading-relaxed group-hover:text-white transition-all duration-500">
                  {f.description}
                </p>
                {/* <div className="mt-4">
                  {f.highlights.map((item, i) => (
                    <FeatureItem key={i} item={item} />
                  ))}
                </div> */}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FeatureItem({ item }: { item: string }) {
  return (
    <Item size={'sm'} className="p-0">
      <ItemMedia>
        <CheckCheckIcon className="size-5" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{item}</ItemTitle>
      </ItemContent>
    </Item>
  );
}
