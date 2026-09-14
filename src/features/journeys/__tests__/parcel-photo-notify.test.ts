import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/email/notify-preference", () => ({ mayEmailUser: vi.fn(async () => true) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { app: { url: "https://tomame.test" } } }));
// Resend is never reached from a test; `sendEmail` is the only door out.
vi.mock("@/lib/email/transport", () => ({ sendEmail: vi.fn() }));
vi.mock("@/db/queries/notifications", () => ({
  insertNotification: vi.fn(),
  markNotificationDelivered: vi.fn(),
  getRecipientEmail: vi.fn(),
}));

import { sendEmail } from "@/lib/email/transport";
import {
  getRecipientEmail,
  insertNotification,
  markNotificationDelivered,
} from "@/db/queries/notifications";
import { mayEmailUser } from "@/lib/email/notify-preference";
import { notifyParcelPhotoAdded } from "../services/parcel-photo-notify.service";

const mockSend = vi.mocked(sendEmail);
const mockInsert = vi.mocked(insertNotification);
const mockDelivered = vi.mocked(markNotificationDelivered);
const mockRecipient = vi.mocked(getRecipientEmail);
const mockMayEmail = vi.mocked(mayEmailUser);

const USER = "11111111-1111-1111-1111-111111111111";
const ORDER = "22222222-2222-2222-2222-222222222222";
const NOW = new Date("2026-09-14T03:00:00.000Z");

function input(overrides: Partial<Parameters<typeof notifyParcelPhotoAdded>[0]> = {}) {
  return {
    orderId: ORDER,
    userId: USER,
    orderNo: "TM-00042",
    productName: "Logitech MX Master 3S",
    photoCount: 1,
    location: "New York",
    weightLbs: 0.6,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockInsert.mockResolvedValue({ id: "notif-1" } as never);
  mockRecipient.mockResolvedValue("kwame@example.com");
  mockMayEmail.mockResolvedValue(true);
  mockSend.mockResolvedValue(undefined as never);
});

describe("notifyParcelPhotoAdded", () => {
  it("writes one bell entry and one email for an arrival", async () => {
    expect(await notifyParcelPhotoAdded(input(), NOW)).toBe("notified");

    expect(mockInsert).toHaveBeenCalledTimes(1);
    const row = mockInsert.mock.calls[0]![0];
    expect(row.user_id).toBe(USER);
    expect(row.event).toBe("parcel_photo_added");
    expect(row.payload).toMatchObject({ order_id: ORDER, order_no: "TM-00042", photo_count: 1 });

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockDelivered).toHaveBeenCalledWith("notif-1", {
      status: "sent",
      sent_at: NOW.toISOString(),
    });
  });

  it("sends ONE message for a batch of photos, not one per photo", async () => {
    // An operator shoots the front, the label and the damaged corner in the same
    // minute. Three emails about one arrival trains the customer to ignore the
    // fourth.
    await notifyParcelPhotoAdded(input({ photoCount: 3 }), NOW);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockInsert.mock.calls[0]![0].payload).toMatchObject({ photo_count: 3 });
    const html = mockSend.mock.calls[0]![0].html;
    expect(html).toContain("3 photos");
  });

  it("links to the journey and never embeds the image", async () => {
    // The bucket is private and the bytes are guarded by a per-request ownership
    // check. A public <img> or an attachment would escape that check entirely.
    await notifyParcelPhotoAdded(input(), NOW);
    const html = mockSend.mock.calls[0]![0].html;

    expect(html).toContain(`https://tomame.test/app/orders/${ORDER}`);
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toContain("parcel-photos");
  });

  it("quotes no money — the customer has already paid", async () => {
    await notifyParcelPhotoAdded(input(), NOW);
    const { html, subject } = mockSend.mock.calls[0]![0];
    expect(html).not.toMatch(/GH₵|\$\d/);
    expect(subject).not.toMatch(/GH₵|\$\d/);
  });

  it("still rings the bell when the customer has email switched off", async () => {
    mockMayEmail.mockResolvedValue(false);

    expect(await notifyParcelPhotoAdded(input(), NOW)).toBe("notified");

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockSend).not.toHaveBeenCalled();
    // The bell IS the delivery, so the row closes `sent` — a row left pending
    // reads as a stuck queue in the admin log.
    expect(mockDelivered).toHaveBeenCalledWith("notif-1", {
      status: "sent",
      sent_at: NOW.toISOString(),
    });
  });

  it("marks the row failed when the send throws, and does not rethrow", async () => {
    mockSend.mockRejectedValue(new Error("resend down"));

    expect(await notifyParcelPhotoAdded(input(), NOW)).toBe("notified");
    expect(mockDelivered).toHaveBeenCalledWith("notif-1", {
      status: "failed",
      sent_at: NOW.toISOString(),
    });
  });

  it("says nothing about an internal-only upload", async () => {
    // `is_customer_visible = false` exists so an operator can file a picture
    // without showing it. Mailing about one the customer cannot open is worse
    // than silence.
    expect(await notifyParcelPhotoAdded(input({ photoCount: 0 }), NOW)).toBe("nothing_visible");
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("says nothing for an order with no owner on file", async () => {
    expect(await notifyParcelPhotoAdded(input({ userId: null }), NOW)).toBe("no_account");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("never lets a notification failure become the caller's problem", async () => {
    // The photo is already stored and its row already written by the time we are
    // called. A throw here once requeued a finished extraction elsewhere in this
    // codebase and charged a vendor twice.
    mockInsert.mockRejectedValue(new Error("notifications table is sulking"));

    expect(await notifyParcelPhotoAdded(input(), NOW)).toBe("error");
  });

  it("omits the weight and place rows when nothing was recorded", async () => {
    await notifyParcelPhotoAdded(input({ location: null, weightLbs: null }), NOW);
    const html = mockSend.mock.calls[0]![0].html;

    expect(html).not.toContain("Received weight");
    expect(html).not.toContain("Where");
    // The order and the item are always there.
    expect(html).toContain("TM-00042");
  });
});
