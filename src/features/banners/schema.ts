import { z } from "zod";

import { BANNER_PLACEMENTS, BANNER_TONES } from "./types";

/** A link is a path on this site ("/app/bag") or an https URL — never `javascript:` or `//host`. */
const linkUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => /^\/(?!\/)/.test(v) || /^https:\/\/[^\s]+$/.test(v), {
    message: "Link must start with / (a page on Tomame) or https://",
  });

/** "" and null both mean "none" — forms send blanks, the column stores NULL. */
const blankToNull = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), schema.nullable());

const isoDate = z.iso.datetime({ offset: true });

const bannerFields = {
  placement: z.enum(BANNER_PLACEMENTS),
  tone: z.enum(BANNER_TONES),
  title: z.string().trim().min(1, "Give the banner a headline").max(120, "Keep the headline under 120 characters"),
  body: blankToNull(z.string().trim().max(400, "Keep the text under 400 characters")),
  link_label: blankToNull(z.string().trim().max(40, "Keep the link text under 40 characters")),
  link_url: blankToNull(linkUrl),
  is_active: z.boolean(),
  dismissible: z.boolean(),
  starts_at: blankToNull(isoDate),
  ends_at: blankToNull(isoDate),
  sort_order: z.number().int().min(0).max(9999),
};

type Shape = {
  link_label?: string | null;
  link_url?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
};

/**
 * 089's two table constraints, said in words the admin can act on. `whole`:
 * the input is the full banner, so a missing half is a missing half. A PATCH
 * may send one half; the service checks it against the stored row.
 */
function withPairs<T extends z.ZodType<Shape>>(schema: T, whole: boolean) {
  return schema
    .refine((v) => (!whole && (v.link_label === undefined || v.link_url === undefined)) || (v.link_label == null) === (v.link_url == null), {
      message: "A link needs both its text and where it goes",
      path: ["link_url"],
    })
    .refine((v) => !v.starts_at || !v.ends_at || new Date(v.ends_at) > new Date(v.starts_at), {
      message: "The end must come after the start",
      path: ["ends_at"],
    });
}

export const createBannerSchema = withPairs(
  z.object({
    ...bannerFields,
    tone: bannerFields.tone.default("info"),
    body: bannerFields.body.optional(),
    link_label: bannerFields.link_label.optional(),
    link_url: bannerFields.link_url.optional(),
    is_active: bannerFields.is_active.default(false),
    dismissible: bannerFields.dismissible.default(false),
    starts_at: bannerFields.starts_at.optional(),
    ends_at: bannerFields.ends_at.optional(),
    sort_order: bannerFields.sort_order.default(0),
  }),
  true,
);
export type CreateBannerInput = z.infer<typeof createBannerSchema>;

export const updateBannerSchema = withPairs(
  z
    .object(bannerFields)
    .partial()
    .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to update" }),
  false,
);
export type UpdateBannerInput = z.infer<typeof updateBannerSchema>;

export const bannerIdSchema = z.uuid("Unknown banner");
