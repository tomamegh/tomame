/**
 * Why an order was cancelled, in the customer's words (site brief Fix 6). The
 * admin picks one when cancelling; it is written as the cancellation event's
 * title ("Cancelled: <reason>"), which /track and the order page show. Kept to
 * plain categories on purpose: /track shows it to anyone holding the number.
 */
export const CANCEL_REASONS = {
  customer_request: "You asked us to cancel it",
  out_of_stock: "Out of stock at the store",
  price_changed: "The store's price changed and the order was not confirmed",
  not_sourceable: "We could not buy it from this store",
  payment_issue: "There was a problem with the payment",
  duplicate: "A duplicate of another order",
  other: "Cancelled by Tomame. Message us on WhatsApp if you would like to know more",
} as const;

export type CancelReason = keyof typeof CANCEL_REASONS;
export const CANCEL_REASON_KEYS = Object.keys(CANCEL_REASONS) as [CancelReason, ...CancelReason[]];
