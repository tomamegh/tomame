import type { MetadataRoute } from "next";

import { listCarListings } from "@/db/queries/cars";
import { hasPublishedCars } from "@/features/cars/services/cars-availability.service";
import { logger } from "@/lib/logger";

/** Re-read hourly: the only moving part is the car shelf. */
export const revalidate = 3600;

const MARKETING_PATHS = ["/", "/fees", "/where-we-buy", "/about", "/faq", "/contact", "/policies"] as const;

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://tomame.ca").replace(/\/+$/, "");
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const entries: MetadataRoute.Sitemap = MARKETING_PATHS.map((path) => ({
    url: `${base}${path === "/" ? "" : path}`,
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : 0.7,
  }));

  // The car shelf only once something is on it, like the nav tab.
  if (await hasPublishedCars()) {
    entries.push({ url: `${base}/app/cars`, changeFrequency: "daily", priority: 0.8 });
    try {
      const { rows } = await listCarListings({ publishedOnly: true, limit: 500 });
      for (const car of rows) {
        entries.push({
          url: `${base}/app/cars/${car.slug}`,
          lastModified: car.updated_at,
          changeFrequency: "weekly",
          priority: 0.6,
        });
      }
    } catch (error: unknown) {
      logger.warn("Sitemap: car listings unavailable", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return entries;
}
