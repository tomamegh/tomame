import * as z from "zod";


export const createOrderSchema = z.object({
  productUrl: z.url("Must be a valid URL"),
  productName: z.string().min(2, "Product name is required"),
  productImageUrl: z.url("Must be a valid URL").optional().or(z.literal("")),
  estimatedPriceUsd: z.coerce.number().positive("Must be a positive number"),
  quantity: z.coerce.number().int().min(1).default(1),
  originCountry: z.enum(["USA", "UK", "CHINA"]),
  specialInstructions: z.string().optional(),
});

export type CreateOrderSchemaType = z.infer<typeof createOrderSchema>;
