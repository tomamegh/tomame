import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/email/transport", () => ({ sendEmail: vi.fn(async () => undefined) }));

const generateLink = vi.fn();
const updateUserById = vi.fn();
const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ rpc, auth: { admin: { generateLink, updateUserById } } })),
}));

const verifyOtp = vi.fn();
const signOut = vi.fn(async () => ({ error: null }));
const profileRead = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { verifyOtp, signOut },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: profileRead }) }) }),
  })),
}));

import { logAuditEvent } from "@/features/audit/services/audit.service";
import { sendEmail } from "@/lib/email/transport";
import { emailCodeVerifySchema } from "../../schema";
import { EMAIL_CODE_SENT, sendEmailSignInCode, verifyEmailSignInCode } from "../email-code.service";

beforeEach(() => {
  vi.clearAllMocks();
  generateLink.mockResolvedValue({ data: { properties: { email_otp: "12345678", hashed_token: "hash-1" } }, error: null });
  rpc.mockResolvedValue({ data: [{ user_id: "u1", confirmed: true }], error: null });
  updateUserById.mockResolvedValue({ error: null });
  profileRead.mockResolvedValue({ data: { id: "u1", role: "user" }, error: null });
});

describe("sendEmailSignInCode", () => {
  it("mints the code without Supabase sending anything, then emails it through our template", async () => {
    await expect(sendEmailSignInCode("ama@example.com")).resolves.toEqual({ message: EMAIL_CODE_SENT });
    expect(generateLink).toHaveBeenCalledWith({ type: "magiclink", email: "ama@example.com" });
    const mail = vi.mocked(sendEmail).mock.calls[0]?.[0];
    expect(mail?.to).toBe("ama@example.com");
    expect(mail?.subject).toBe("12345678 is your Tomame sign-in code");
    expect(mail?.html).toContain("12345678");
    expect(mail?.text).toContain("12345678");
  });

  it("answers 503 and sends nothing when Supabase cannot mint a code", async () => {
    generateLink.mockResolvedValue({ data: { properties: null }, error: { message: "down", code: "unexpected_failure" } });
    await expect(sendEmailSignInCode("ama@example.com")).rejects.toMatchObject({ statusCode: 503 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("answers 503 when the email cannot be sent", async () => {
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("Resend error: x"));
    await expect(sendEmailSignInCode("ama@example.com")).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe("verifyEmailSignInCode", () => {
  const user = (over: Record<string, unknown> = {}) => ({
    id: "u1",
    created_at: "2025-01-01T00:00:00Z",
    email_confirmed_at: "2025-01-01T00:05:00Z",
    ...over,
  });

  it("signs in an existing account and audits it as a code sign-in", async () => {
    verifyOtp.mockResolvedValue({ data: { user: user() }, error: null });
    await expect(verifyEmailSignInCode("ama@example.com", "12345678")).resolves.toEqual({ isNew: false });
    expect(verifyOtp).toHaveBeenCalledWith({ email: "ama@example.com", token: "12345678", type: "email" });
    expect(updateUserById).not.toHaveBeenCalled();
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "user_logged_in", metadata: { method: "email_code" } }));
  });

  it("treats an address this code confirmed as new, replaces any password set before it was proven, and signs in again", async () => {
    rpc.mockResolvedValue({ data: [{ user_id: "u1", confirmed: false }], error: null });
    verifyOtp.mockResolvedValue({ data: { user: user() }, error: null });
    await expect(verifyEmailSignInCode("ama@example.com", "12345678")).resolves.toEqual({ isNew: true });
    expect(rpc).toHaveBeenCalledWith("auth_email_state", { p_email: "ama@example.com" });
    expect(updateUserById).toHaveBeenCalledWith("u1", { password: expect.any(String) });
    // A password change signs out every session, so a fresh one is verified into the cookies.
    expect(verifyOtp).toHaveBeenLastCalledWith({ type: "magiclink", token_hash: "hash-1" });
    const rotatedAt = updateUserById.mock.invocationCallOrder[0] ?? Infinity;
    const resessionAt = verifyOtp.mock.invocationCallOrder[1] ?? -Infinity;
    expect(rotatedAt).toBeLessThan(resessionAt);
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "user_registered" }));
  });

  it("checks the account state before the code is spent, and never rotates for a wrong code", async () => {
    rpc.mockResolvedValue({ data: [{ user_id: "u1", confirmed: false }], error: null });
    verifyOtp.mockResolvedValue({ data: { user: null }, error: { code: "otp_expired", status: 403, message: "x" } });
    await expect(verifyEmailSignInCode("ama@example.com", "00000000")).rejects.toMatchObject({ statusCode: 400 });
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(verifyOtp.mock.invocationCallOrder[0] ?? 0);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("answers a wrong or expired code with one message (Supabase does not tell them apart)", async () => {
    verifyOtp.mockResolvedValue({ data: { user: null }, error: { code: "otp_expired", status: 403, message: "Token has expired or is invalid" } });
    await expect(verifyEmailSignInCode("ama@example.com", "00000000")).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("isn't right, or it has expired"),
    });
  });

  it("refuses a deactivated account with 403", async () => {
    verifyOtp.mockResolvedValue({ data: { user: null }, error: { code: "user_banned", status: 403, message: "banned" } });
    await expect(verifyEmailSignInCode("ama@example.com", "12345678")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("drops the session and answers 503 when the profile cannot be read", async () => {
    verifyOtp.mockResolvedValue({ data: { user: user() }, error: null });
    profileRead.mockResolvedValue({ data: null, error: { code: "PGRST303", message: "JWT issued at future" } });
    await expect(verifyEmailSignInCode("ama@example.com", "12345678")).rejects.toMatchObject({ statusCode: 503 });
    expect(signOut).toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});

describe("emailCodeVerifySchema", () => {
  it("drops the spaces and dashes a mail client adds", () => {
    expect(emailCodeVerifySchema.parse({ email: " Ama@Example.com ", code: "1234 5678" })).toEqual({ email: "ama@example.com", code: "12345678" });
    expect(emailCodeVerifySchema.parse({ email: "a@b.co", code: "123-456" }).code).toBe("123456");
  });

  it("refuses anything that is not a code", () => {
    expect(emailCodeVerifySchema.safeParse({ email: "a@b.co", code: "12345" }).success).toBe(false);
    expect(emailCodeVerifySchema.safeParse({ email: "a@b.co", code: "12ab5678" }).success).toBe(false);
  });
});
