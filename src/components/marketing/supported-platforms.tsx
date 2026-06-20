"use client";

import Image from "next/image";
import Link from "next/link";
import { SUPPORTED_STORES } from "@/config/ui";

export default function LandingPageSupportedPlatforms() {


  return (
    <section className="bg-neutral-50 py-12 sm:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative h-12 flex items-center gap-5 justify-center overflow-hidden">
          {[...SUPPORTED_STORES].map((store) => (
            <Link
              key={store.id}
              href={store.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Visit ${store.name}`}
              className="h-12 px-5 grayscale hover:grayscale-0 transition-all duration-300 flex flex-col items-center justify-center"
            >
              {store.logo ? (
                <Image
                  src={store.logo}
                  alt={store.name}
                  width={72}
                  height={24}
                  className="h-6 w-auto object-contain"
                />
              ) : (
                <span
                  className={`whitespace-nowrap text-sm font-bold ${store.textClassName}`}
                >
                  {store.name}
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
