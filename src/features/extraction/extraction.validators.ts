import { z } from "zod";

export const extractProductSchema = z.object({
  productUrl: z.string().url("Must be a valid URL"),
});
