import { z } from "zod";

export const createStoreSchema = z.object({
  domain: z
    .string({ error: "Domain is required" })
    .trim()
    .toLowerCase()
    .min(1, "Domain is required")
    .max(253, "Domain is too long"),
  displayName: z
    .string({ error: "Display name is required" })
    .trim()
    .min(1, "Display name is required")
    .max(100, "Display name must be under 100 characters"),
});

export const updateStoreSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Display name is required")
    .max(100, "Display name must be under 100 characters")
    .optional(),
  enabled: z.boolean().optional(),
});
