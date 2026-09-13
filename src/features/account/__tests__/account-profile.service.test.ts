import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/audit/services/audit.service", () => ({
  logAuditEvent: vi.fn(async () => undefined),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({}) as never) }));
vi.mock("@/db/queries/profiles", () => ({
  selectAccountProfile: vi.fn(),
  updateAccountProfile: vi.fn(),
}));

import {
  selectAccountProfile,
  updateAccountProfile as writeAccountProfile,
  type AccountProfileRow,
} from "@/db/queries/profiles";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { APIError } from "@/lib/auth/api-helpers";
import {
  getAccountProfile,
  resolveNotificationChannels,
  updateAccountProfile,
} from "../services/account-profile.service";

const ACTOR = { id: "u1", role: "user" as const, email: "kwame@tomame.local" };

const row = (over: Partial<AccountProfileRow> = {}): AccountProfileRow => ({
  id: "u1",
  first_name: "Kwame",
  last_name: "Mensah",
  bio: null,
  phone: null,
  whatsapp_opt_in: false,
  notify_email: true,
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  // Echo the patch back, the way an UPDATE … RETURNING would.
  vi.mocked(writeAccountProfile).mockImplementation(async (_c, _id, patch) =>
    row({ ...patch } as Partial<AccountProfileRow>),
  );
});

describe("reading the preferences", () => {
  it("returns the stored booleans alongside the auth email", async () => {
    vi.mocked(selectAccountProfile).mockResolvedValue(
      row({ phone: "024 555 0192", whatsapp_opt_in: true, notify_email: false }),
    );

    const profile = await getAccountProfile("u1", "kwame@tomame.local");

    expect(profile.notify_email).toBe(false);
    expect(profile.whatsapp_opt_in).toBe(true);
    expect(profile.phone).toBe("024 555 0192");
    // Email is not a `profiles` column; it comes from the session.
    expect(profile.email).toBe("kwame@tomame.local");
  });

  it("is a 404 when the row is gone, not an empty form", async () => {
    vi.mocked(selectAccountProfile).mockResolvedValue(null);
    await expect(getAccountProfile("u1", null)).rejects.toBeInstanceOf(APIError);
  });
});

describe("resolveNotificationChannels", () => {
  it("reports WhatsApp off when the opt-in has no number behind it", () => {
    expect(
      resolveNotificationChannels({ phone: null, notify_email: true, whatsapp_opt_in: true }),
    ).toEqual({ email: true, whatsapp: false, whatsappNeedsPhone: true });
  });

  it("treats a whitespace-only number as no number", () => {
    expect(
      resolveNotificationChannels({ phone: "   ", notify_email: false, whatsapp_opt_in: true }),
    ).toEqual({ email: false, whatsapp: false, whatsappNeedsPhone: true });
  });

  it("reports both on when the opt-in has a number", () => {
    expect(
      resolveNotificationChannels({
        phone: "0245550192",
        notify_email: true,
        whatsapp_opt_in: true,
      }),
    ).toEqual({ email: true, whatsapp: true, whatsappNeedsPhone: false });
  });
});

describe("writing the preferences", () => {
  it("saves a single toggle without disturbing the other columns", async () => {
    vi.mocked(selectAccountProfile).mockResolvedValue(row());

    await updateAccountProfile(ACTOR, { notify_email: false });

    expect(writeAccountProfile).toHaveBeenCalledWith({}, "u1", { notify_email: false });
  });

  it("refuses WhatsApp when there is no number to send to", async () => {
    vi.mocked(selectAccountProfile).mockResolvedValue(row({ phone: null }));

    await expect(updateAccountProfile(ACTOR, { whatsapp_opt_in: true })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(writeAccountProfile).not.toHaveBeenCalled();
  });

  it("allows WhatsApp when the same patch supplies the number", async () => {
    vi.mocked(selectAccountProfile).mockResolvedValue(row({ phone: null }));

    await updateAccountProfile(ACTOR, { whatsapp_opt_in: true, phone: "0245550192" });

    expect(writeAccountProfile).toHaveBeenCalledWith({}, "u1", {
      whatsapp_opt_in: true,
      phone: "0245550192",
    });
  });

  it("allows WhatsApp when the number is already on the row", async () => {
    vi.mocked(selectAccountProfile).mockResolvedValue(row({ phone: "0245550192" }));

    await updateAccountProfile(ACTOR, { whatsapp_opt_in: true });

    expect(writeAccountProfile).toHaveBeenCalledWith({}, "u1", { whatsapp_opt_in: true });
  });

  it("withdraws the opt-in when the phone number is cleared", async () => {
    // The consent was attached to that number. Leaving it true would switch
    // WhatsApp back on by itself the moment a new number was saved.
    vi.mocked(selectAccountProfile).mockResolvedValue(
      row({ phone: "0245550192", whatsapp_opt_in: true }),
    );

    await updateAccountProfile(ACTOR, { phone: null });

    expect(writeAccountProfile).toHaveBeenCalledWith({}, "u1", {
      phone: null,
      whatsapp_opt_in: false,
    });
  });

  it("leaves a false opt-in alone when the phone is cleared", async () => {
    vi.mocked(selectAccountProfile).mockResolvedValue(
      row({ phone: "0245550192", whatsapp_opt_in: false }),
    );

    await updateAccountProfile(ACTOR, { phone: null });

    expect(writeAccountProfile).toHaveBeenCalledWith({}, "u1", { phone: null });
  });

  it("audits the field names and never the values", async () => {
    vi.mocked(selectAccountProfile).mockResolvedValue(row({ phone: "0245550192" }));

    await updateAccountProfile(ACTOR, { phone: "030 276 0000", notify_email: false });

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "u1",
        actorRole: "user",
        action: "user_profile_updated",
        entityType: "user",
        entityId: "u1",
        metadata: { fields: ["notify_email", "phone"] },
      }),
    );
    // `audit_logs` is append-only: a phone number written there could never be
    // removed again.
    const entry = vi.mocked(logAuditEvent).mock.calls[0]?.[0];
    expect(JSON.stringify(entry)).not.toContain("030 276 0000");
  });

  it("is a 404 when the row is gone, and writes nothing", async () => {
    vi.mocked(selectAccountProfile).mockResolvedValue(null);

    await expect(updateAccountProfile(ACTOR, { notify_email: true })).rejects.toBeInstanceOf(
      APIError,
    );
    expect(writeAccountProfile).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});
