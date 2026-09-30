import { z } from "zod";

/**
 * What a browser may tell `POST /api/ops/client-errors`.
 *
 * DELIBERATELY NARROW. There is no field for a request body, a form value, a
 * header or a cookie, so a report cannot carry a password, a token or a card
 * number however a call site is written. The user is NOT taken from here: the
 * route reads it off the session, because a client-supplied id is a lie
 * waiting to be told.
 */
export const CLIENT_ERROR_KINDS = ["api_4xx", "render", "window", "rejection"] as const;
export type ClientErrorKind = (typeof CLIENT_ERROR_KINDS)[number];

export const clientErrorReportSchema = z.object({
  kind: z.enum(CLIENT_ERROR_KINDS),
  message: z.string().trim().min(1).max(500),
  /** `location.pathname` of the screen, never the query string. */
  page: z.string().trim().max(200).optional(),
  /** The API path that answered, for `api_4xx`. */
  api: z.string().trim().max(200).optional(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional(),
  status: z.number().int().min(400).max(599).optional(),
  /** Next's error digest, which correlates a crashed screen with the server log. */
  digest: z.string().trim().max(64).optional(),
});

export type ClientErrorReport = z.infer<typeof clientErrorReportSchema>;
