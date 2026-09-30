import type { MetadataRoute } from "next";

import { siteUrl } from "./sitemap";

/**
 * Crawl the marketing site and the public car shelf; keep crawlers out of the
 * signed-in app, the admin, the API and the auth screens. `/app/cars` is
 * allowed explicitly because it is public and listed in the sitemap; the
 * longer `Allow` wins over `Disallow: /app/`.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/app/cars"],
        disallow: ["/admin", "/app/", "/api/", "/api-docs", "/auth/", "/offline"],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
