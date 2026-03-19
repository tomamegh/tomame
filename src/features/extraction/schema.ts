import * as z from "zod";

export const extractProductSchema = z.object({
  product_url: z.url("Must be a valid URL"),
});

export type ExtractionSchemaType = z.infer<typeof extractProductSchema>;