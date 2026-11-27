/**
 * Payments staff recorded by hand ("Buy for a customer") carry the channel
 * `offline_<method>`. These are the words a receipt, the order timeline and the
 * admin tables print for them; null for any other channel.
 */
const OFFLINE_LABELS: Record<string, string> = {
  offline_momo: "Mobile Money to Tomame",
  offline_bank_transfer: "Bank transfer to Tomame",
  offline_cash: "Cash to Tomame",
  offline_card: "Card at Tomame",
  offline_other: "Paid to Tomame",
};

export function offlineChannelLabel(channel: string | null | undefined): string | null {
  if (!channel) return null;
  return OFFLINE_LABELS[channel.trim()] ?? (channel.startsWith("offline_") ? "Paid to Tomame" : null);
}
