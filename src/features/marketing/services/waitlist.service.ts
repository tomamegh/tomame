import "server-only";

import { APIError } from "@/lib/auth/api-helpers";
import { getRegionByCode } from "@/db/queries/regions";
import {
  insertWaitlistSignup,
  UnknownRegionError,
} from "@/db/queries/waitlist";
import { logger } from "@/lib/logger";
import type { WaitlistJoinInput, WaitlistJoinResult } from "../types";

/**
 * Join the waitlist for a lane that is not open yet.
 *
 * A repeat signup is not an error: `UNIQUE (email, region_code)` is resolved
 * with ON CONFLICT DO NOTHING and reported back as `already_joined`, so the
 * page can say "you're on the list" either way and the endpoint cannot be used
 * to probe who has already signed up.
 */
export async function joinWaitlist(
  input: WaitlistJoinInput,
): Promise<WaitlistJoinResult> {
  const email = input.email.trim().toLowerCase();
  const regionCode = input.regionCode.trim().toUpperCase();
  const phone = input.phone?.trim() || null;

  const region = await getRegionByCode(regionCode);
  if (!region) {
    throw new APIError(400, "We don't have a lane for that region.");
  }
  if (region.status === "live") {
    throw new APIError(
      400,
      `${region.name} is already open — you can order from it today.`,
    );
  }

  try {
    const result = await insertWaitlistSignup({
      email,
      phone,
      region_code: region.code,
      user_id: input.userId ?? null,
    });

    return {
      status: result.created ? "joined" : "already_joined",
      regionCode: region.code,
      regionName: region.name,
    };
  } catch (error: unknown) {
    // The region existed a moment ago; a FK failure means it was just removed.
    if (error instanceof UnknownRegionError) {
      throw new APIError(400, "We don't have a lane for that region.");
    }
    logger.error("Failed to record waitlist signup", {
      region: region.code,
      error: String(error),
    });
    throw new APIError(500, "We couldn't add you to the waitlist. Try again.");
  }
}
