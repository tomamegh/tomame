import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { requireAuth } from "@/lib/auth/guards";
import { APIError, successResponse, errorResponse } from "@/lib/auth/api-helpers";
import { updateAccountProfileSchema } from "@/features/account/schema";
import { updateAccountProfile } from "@/features/account/services/account-profile.service";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);
    return successResponse(auth);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Edits the signed-in customer's own profile — the Profile and Notifications
 * tabs of `/app/account` both land here, because name, phone and the two
 * channel preferences are all columns of the same `profiles` row (051).
 *
 * HTTP orchestration only (CLAUDE.md): parse, authenticate, hand to the service,
 * shape the response. The rules about what a valid patch means — WhatsApp
 * needing a number, clearing a number withdrawing the opt-in — and the audit
 * entry live in `account-profile.service.ts`, where they can be tested without
 * a request object.
 */
export async function PATCH(request: NextRequest) {
  try {
    const body: unknown = await request.json().catch(() => {
      throw new APIError(400, "Invalid JSON");
    });
    const parsed = updateAccountProfileSchema.safeParse(body);
    if (!parsed.success) {
      throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const user = await getAuthenticatedUser();
    const auth = requireAuth(user);

    const profile = await updateAccountProfile(
      { id: auth.id, role: auth.profile.role, email: auth.email ?? null },
      parsed.data,
    );

    // `{ profile }` is the shape this endpoint has always answered PATCH with
    // (its GET answers differently — noted as a defect in the data map, and left
    // alone here so no existing caller breaks on a Phase 6 change).
    return successResponse({ profile });
  } catch (error) {
    return errorResponse(error);
  }
}
