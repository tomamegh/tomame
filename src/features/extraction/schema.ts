import * as z from "zod";

import { webLinkSchema } from "@/lib/validators/link";

/**
 * A pasted product link. Scheme optional (`amazon.com/dp/B0X` is a link to the
 * paste box and to the customer), added here so the route gets a real URL.
 */
export const extractProductSchema = z.object({
  product_url: webLinkSchema("Must be a valid URL"),
});

export type ExtractionSchemaType = z.infer<typeof extractProductSchema>;