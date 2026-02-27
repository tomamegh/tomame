"use client";
import { motion } from "motion/react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../ui/accordion";
const FAQS = [
  {
    title: "What ecommerce platforms do you support?",
    content:
      "We support Amazon, eBay, Apple, Walmart, Target, Etsy, Alibaba, and 100+ other ecommerce sites globally.",
  },
  {
    title: "How is shipping calculated?",
    content:
      "Shipping is calculated in real-time based on package weight, dimensions, and destination country using actual carrier rates.",
  },
  {
    title: "Can I get a refund if extraction fails?",
    content:
      "Yes. If we cannot extract a product's data, we refund 100% of service fees within 24 hours. No questions asked.",
  },
  {
    title: "Do you offer an API?",
    content:
      "Professional and Enterprise plans include full REST API access for programmatic order placement, tracking, and catalog sync.",
  },
  {
    title: "How long does delivery take?",
    content:
      "Delivery typically takes 2–4 weeks depending on the destination and shipping method. Express options are available.",
  },
];

export default function FAQSection() {
  return (
    <section className="py-20 sm:py-28 lg:py-32 bg-white">
      <div className="text-center mb-12 sm:mb-16 md:mb-24">
        <p className="inline-block px-3 py-1 mb-3 rounded-full bg-primary/20 text-primary text-xs font-semibold tracking-wide uppercase">
          FAqs
        </p>{" "}
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-stone-900 mb-4">
          Frequently asked questions
        </h2>
        <p className="text-base sm:text-lg text-stone-500 max-w-xl mx-auto">
          Quick answers to common questions about the platform.
        </p>
      </div>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 flex max-md:flex-col gap-5 sm:gap-6 md:gap-12">
        <motion.div className="flex-1">
          <Accordion collapsible type="single" className="space-y-5">
            {FAQS.map((faq, i) => {
              return (
                // Slide up animation
                <AccordionItem key={faq.title} value={faq.title}>
                  <AccordionTrigger className="text-lg underline-offset-4">
                    {faq.title}
                  </AccordionTrigger>
                  <AccordionContent className="text-base">
                    {faq.content}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </motion.div>
        {/* <motion.div className="md:basis-1/3 md:justify-self-end rounded-2xl md:min-h-120">
          <Image
            src="/images/faq.svg"
            alt="FAQ"
            className="flex-1 mx-auto h-120 bg-red-200"
            width={400}
            height={1000}
          />
        </motion.div> */}
      </div>
    </section>
  );
}
