import Image, { type ImageProps } from "next/image";

import { imageOptimizerDecision } from "@/lib/security/image-hosts";

/**
 * `next/image` for photos scraped from stores.
 *
 * An allowlisted host goes through the optimizer as usual. Any other host is
 * pointed straight at `/api/image-passthrough`, unoptimized. The proxy's
 * `/_next/image` rewrite (`src/lib/supabase/proxy.ts`) cannot do this on
 * Vercel: the platform serves `/_next/image` itself, ahead of the proxy, and
 * 400s an unlisted host — which is how PrettyLittleThing's whole gallery
 * rendered as broken images in production. Deciding here, before the URL is
 * built, works on every host.
 */
export function StoreImage({ src, unoptimized, ...props }: ImageProps) {
  const passthrough = typeof src === "string" ? passthroughSrc(src) : null;
  if (!passthrough) return <Image src={src} unoptimized={unoptimized} {...props} />;
  return <Image src={passthrough} unoptimized {...props} />;
}

/** The passthrough path for an external, non-allowlisted image URL; null when the optimizer can take it. */
export function passthroughSrc(src: string): string | null {
  // data:/blob: parse as URLs with an empty host; only real remote photos qualify.
  if (!/^https?:\/\//i.test(src)) return null;
  const decision = imageOptimizerDecision(src);
  return decision.action === "passthrough" ? `/api/image-passthrough?url=${encodeURIComponent(decision.to)}` : null;
}
