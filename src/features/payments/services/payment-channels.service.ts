import "server-only";
import { z } from "zod";
import { getSiteSettingsMap } from "@/db/queries/site-settings";
import { isSchemaMissingError } from "@/lib/supabase/errors";
import { logger } from "@/lib/logger";
import type { PaymentChannel } from "@/features/payments/types";

/**
 * Payment channels are admin data (`site_settings.payment_channels`, shaped in
 * 048), never a literal: the bag's selector sends `paystack_channel` to
 * Paystack, so a typo in the row must be dropped here rather than reach the
 * charge. A missing table is a deploy-ordering bug and rethrows (gotcha #5).
 */
const channelSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  paystack_channel: z.enum(["mobile_money", "card"]),
  provider: z.enum(["mtn", "vod", "atl"]).nullable(),
  dot: z.string().nullable(),
});

/** `site_settings.payment_channels` parsed and validated; invalid entries are dropped with a warning. */
export async function listPaymentChannels(): Promise<PaymentChannel[]> {
  return parseChannels(await readSettings());
}

export async function getPaymentChannel(id: string): Promise<PaymentChannel | null> {
  return (await listPaymentChannels()).find((c) => c.id === id) ?? null;
}

/** `site_settings.payment_hold_note` — the one line under the pay button. Null when unset. */
export async function getPaymentHoldNote(): Promise<string | null> {
  return parseHoldNote(await readSettings());
}

/**
 * Both halves of the pay rail from a single `site_settings` read. The bag page
 * needs the channels and the note on every render; asking for them separately
 * cost two round trips for one row, so the page takes this and destructures.
 */
export async function getBagPaymentSettings(): Promise<{ channels: PaymentChannel[]; holdNote: string | null }> {
  const settings = await readSettings();
  return { channels: parseChannels(settings), holdNote: parseHoldNote(settings) };
}

function parseChannels(settings: Record<string, unknown> | null): PaymentChannel[] {
  if (!settings) return [];
  const raw = settings.payment_channels;
  if (!Array.isArray(raw)) {
    if (raw !== undefined) logger.warn("payment_channels is not an array", { type: typeof raw });
    return [];
  }
  const channels: PaymentChannel[] = [];
  raw.forEach((entry, index) => {
    const parsed = channelSchema.safeParse(entry);
    if (parsed.success) channels.push(parsed.data);
    else logger.warn("Dropping malformed payment channel", { index, issue: parsed.error.issues[0]?.message });
  });
  return channels;
}

function parseHoldNote(settings: Record<string, unknown> | null): string | null {
  const note = settings?.payment_hold_note;
  return typeof note === "string" && note.length > 0 ? note : null;
}

async function readSettings(): Promise<Record<string, unknown> | null> {
  try {
    return await getSiteSettingsMap();
  } catch (error: unknown) {
    if (isSchemaMissingError(error)) throw error;
    logger.warn("Payment channels: site settings unavailable", { error: String(error) });
    return null;
  }
}
