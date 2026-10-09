import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/features/audit/services/audit.service", () => ({
  logAuditEvent: vi.fn(async () => undefined),
}));

const getUser = vi.fn();
const getClaims = vi.fn();
const single = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(
    async () =>
      ({
        auth: { getUser, getClaims },
        from: () => ({ select: () => ({ eq: () => ({ single, maybeSingle: single }) }) }),
      }) as never,
  ),
}));

import { getAuthenticatedUser, getUserSession } from "../services/auth.service";
import { requireContactDetails } from "@/features/account/services/contact-details.service";

const customer = {
  id: "cust-1",
  email: "ama@example.com",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: "2026-01-01T00:00:00Z",
};

const profile = {
  id: "cust-1",
  role: "user",
  first_name: "Ama",
  last_name: "Mensah",
  phone: "+233553156178",
  bio: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: customer }, error: null });
  getClaims.mockResolvedValue({ data: { claims: { sub: "cust-1", app_metadata: {} } }, error: null });
  single.mockResolvedValue({ data: profile, error: null });
});

/**
 * Found live on prod, 2026-10-09: every bag checkout answered "Add your full
 * name and phone number" to customers who had just saved both. The loaders
 * copied the profile field by field and left `phone` out, so the order guard
 * never saw one — and each refused tap spent the 5-per-hour checkout budget.
 */
describe("the signed-in user carries the profile phone to the order guard", () => {
  it("getAuthenticatedUser", async () => {
    const user = await getAuthenticatedUser();
    expect(user!.profile.phone).toBe("+233553156178");
    expect(() => requireContactDetails(user!)).not.toThrow();
  });

  it("getUserSession", async () => {
    const { user } = await getUserSession();
    expect(user.profile.phone).toBe("+233553156178");
    expect(() => requireContactDetails(user)).not.toThrow();
  });

  it("still refuses a profile with no phone", async () => {
    single.mockResolvedValue({ data: { ...profile, phone: null }, error: null });
    const user = await getAuthenticatedUser();
    expect(() => requireContactDetails(user!)).toThrow(/phone number/);
  });
});
