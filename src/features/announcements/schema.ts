import { z } from "zod";

/** The communication center's compose form (119), shared by the route and the form. */
export const announcementInputSchema = z
  .object({
    title: z.string().trim().min(1, "Give it a title").max(120),
    body: z.string().trim().min(1, "Write the message").max(1000),
    link_href: z
      .string()
      .trim()
      .max(300)
      .refine((v) => v === "" || (v.startsWith("/") && !v.startsWith("//")), "A link must be a page on Tomame, starting with /")
      .optional(),
    link_label: z.string().trim().max(40).optional(),
    audience: z.enum(["all", "ordered", "one"]),
    email: z.string().trim().max(200).optional(),
    expires_in_days: z.coerce.number().int().min(1).max(90).optional(),
  })
  .refine((v) => v.audience !== "one" || !!v.email?.includes("@"), { message: "Enter the customer's email", path: ["email"] })
  .refine((v) => !v.link_href || !!v.link_label, { message: "Name the link button", path: ["link_label"] });

export type AnnouncementInput = z.infer<typeof announcementInputSchema>;
