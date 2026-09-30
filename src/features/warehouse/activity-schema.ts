import { z } from "zod";

/**
 * The beacon's body (082). A pathname under `/warehouse` and nothing else — no
 * actor, no kind, no subject. The server knows who is asking, and the only
 * thing a browser may claim is that it opened a page.
 */
export const pageViewSchema = z.object({
  path: z
    .string()
    .trim()
    .max(300)
    .regex(/^\/warehouse(\/[A-Za-z0-9._~%-]+)*\/?$/, "Not a warehouse page"),
});

export type PageViewInput = z.infer<typeof pageViewSchema>;
