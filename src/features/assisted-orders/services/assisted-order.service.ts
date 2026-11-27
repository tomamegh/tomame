import "server-only";

import { randomUUID } from "node:crypto";

import { findUserIdByEmail } from "@/db/queries/announcements";
import { listOrdersByGroup } from "@/db/queries/orders";
import { adoptCart, findOpenCart, findOpenSessionCart, setCartStatus } from "@/db/queries/carts";
import {
  createPasswordlessAccount,
  getAuthUser,
  getCustomerProfile,
  updateCustomerProfile,
  type CustomerProfileRow,
} from "@/db/queries/customer-accounts";
import { getDeliveryAddressById, insertDeliveryAddress, listDeliveryAddresses } from "@/db/queries/delivery-addresses";
import { listActiveDeliveryZones, type DeliveryZoneRow } from "@/db/queries/delivery-zones";
import { getValidExtractionById, upsertExtractionCache } from "@/db/queries/extraction-cache";
import { isContactPhone } from "@/features/addresses/phone";
import { staffPricedResult } from "@/features/assisted/services/manual-quote.service";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { addToBag, previewBatch } from "@/features/bag/services/bag.service";
import { checkoutBag } from "@/features/bag/services/checkout.service";
import type { BagLine } from "@/features/bag/types";
import { extractPrepared, prepareProductUrl } from "@/features/extraction/extraction.service";
import { itemOptionQuestions, type ItemOptionQuestion } from "@/features/extraction/item-options";
import type { PayHold } from "@/features/extraction/pay-gate";
import { variantChoicesOf, type VariantChoices } from "@/features/extraction/variant-choices";
import { recordOfflineGroupPayment } from "@/features/payments/services/payments.service";
import { resolvePaymentTimeouts } from "@/features/payments/services/payment-reconciliation.service";
import type { DeliveryAddress } from "@/features/addresses/types";
import type { PlatformRoles } from "@/features/auth/types";
import type { PlatformUser } from "@/features/users/types";
import { AUDIT_ACTOR_ROLES, AUDIT_ENTITY_TYPES, QUOTE_VALID_HOURS } from "@/config/constants";
import { APIError } from "@/lib/auth/api-helpers";
import { mayEmailUser } from "@/lib/email/notify-preference";
import { assistedOrderTemplate } from "@/lib/email/templates/assisted-order";
import { sendEmail } from "@/lib/email/transport";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatChosenOptions, chosenOptionsOf } from "@/features/extraction/item-options";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { AssistedPriceInput, PlaceAssistedOrderInput } from "../schema";

/** One item on the "Buy for a customer" screen: what the reader found, what it costs, what is still open. */
export interface AssistedLineView {
  extraction_cache_id: string;
  product_url: string;
  title: string | null;
  image: string | null;
  store: string | null;
  price: number | null;
  currency: string | null;
  category: string | null;
  weight_lbs: number | null;
  /** "staff" once a buyer set it here or on the Assisted queue. */
  price_source: string | null;
  /** Landed GH₵ for one unit, null when it cannot be priced yet. */
  unit_total_ghs: number | null;
  pricing_unavailable_reason: string | null;
  pay_hold: PayHold | null;
  questions: ItemOptionQuestion[];
  variant_choices: VariantChoices | null;
  messages: string[];
}

export interface AssistedCustomerLookup {
  customer: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    role: string;
  } | null;
  addresses: Array<Pick<DeliveryAddress, "id" | "label" | "recipient_name" | "line1" | "city" | "delivery_zone_id" | "is_default">>;
  zones: Array<Pick<DeliveryZoneRow, "id" | "name" | "kind" | "fee_ghs">>;
}

export interface PlacedAssistedOrder {
  customer_id: string;
  account_created: boolean;
  order_group_id: string;
  order_ids: string[];
  total_ghs: number;
  /** "paid": staff recorded the customer's payment. "awaiting_payment": the customer was emailed a link to pay. */
  status: "paid" | "awaiting_payment";
  /** Null while the customer has not paid (pay-link orders). */
  payment_reference: string | null;
  /** Where the customer's email went, or null when it could not be sent. */
  emailed_to: string | null;
  /** Opens WhatsApp to the customer with the confirmation typed out, for staff to send. */
  whatsapp_href: string | null;
}

const staffViewer = (adminId: string) => ({ userId: adminId, sessionId: null });

// ── Items ───────────────────────────────────────────────────────────────────

/** Read a pasted link exactly as a customer paste is read, and answer with the screen's line. */
export async function quoteLinkForCustomer(
  adminId: string,
  productUrl: string,
): Promise<{ line: AssistedLineView; enrich?: () => Promise<void> }> {
  const prepared = await prepareProductUrl(productUrl);
  const { enrich, extraction_cache_id } = await extractPrepared(prepared, staffViewer(adminId));
  if (!extraction_cache_id) throw new APIError(502, "We couldn't read that link. Try again, or price it by hand.");
  const [line] = await lineViews(adminId, [extraction_cache_id]);
  if (!line) throw new APIError(502, "We couldn't read that link. Try again, or price it by hand.");
  return { line, enrich };
}

/** The screen's lines for quotes it already holds (after a price, a variant pick, or to refresh). */
export async function lineViews(adminId: string, ids: readonly string[]): Promise<AssistedLineView[]> {
  const unique = [...new Set(ids)].slice(0, 10);
  const [rows, preview] = await Promise.all([
    Promise.all(unique.map((id) => getValidExtractionById(id))),
    previewBatch(staffViewer(adminId), unique),
  ]);
  const byId = new Map<string, BagLine>(preview.lines.map((l) => [l.extraction_cache_id ?? l.id, l]));
  const views: AssistedLineView[] = [];
  for (const row of rows) {
    if (!row) continue;
    const { product, platform } = row.result;
    const line = byId.get(row.id) ?? null;
    views.push({
      extraction_cache_id: row.id,
      product_url: row.product_url,
      title: product.title ?? null,
      image: product.image ?? product.images?.[0] ?? null,
      store: platform ?? null,
      price: product.price ?? null,
      currency: product.currency ?? null,
      category: product.category ?? null,
      weight_lbs: product.weight_lbs ?? null,
      price_source: row.result.price_source ?? null,
      unit_total_ghs: line?.pricing?.total_ghs ?? null,
      pricing_unavailable_reason: line?.pricing ? null : (line?.pricing_unavailable_reason ?? "This item cannot be priced yet."),
      pay_hold: line?.pay_hold ?? null,
      questions: itemOptionQuestions({ product, platform }),
      variant_choices: variantChoicesOf(product),
      messages: (row.result.messages ?? []).slice(0, 3),
    });
  }
  return views;
}

/**
 * A buyer states the store's price (and category, weight) for a quote the
 * reader could not price or priced wrongly. Written into the shared snapshot as
 * a staff price, the same as the Assisted queue's "Price it by hand", so every
 * later read of this link is priced from it and no price check holds it.
 */
export async function priceQuoteForCustomer(adminId: string, input: AssistedPriceInput): Promise<AssistedLineView> {
  const row = await getValidExtractionById(input.extraction_cache_id);
  if (!row) throw new APIError(404, "This quote has expired. Paste the link again.");

  const now = new Date();
  const result = staffPricedResult(row.result, { product_url: row.product_url }, input, now);
  // Keep the country the reader found: a UK store's item still flies from the UK.
  result.country = row.result.country ?? result.country;
  const cacheId = await upsertExtractionCache({
    urlHash: row.url_hash,
    productUrl: row.product_url,
    result,
    complete: true,
    source: null,
    requestedBy: adminId,
    expiresAt: new Date(now.getTime() + QUOTE_VALID_HOURS * 3_600_000).toISOString(),
  });
  if (!cacheId) throw new APIError(500, "Could not save the price. Try again.");

  await logAuditEvent({
    actorId: adminId,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    action: "assisted_order_quote_priced",
    entityType: AUDIT_ENTITY_TYPES.EXTRACTION,
    entityId: cacheId,
    metadata: { price_usd: input.price_usd, category: input.category, weight_lbs: input.weight_lbs ?? null, previous_price: row.result.product.price ?? null },
  });
  const [line] = await lineViews(adminId, [cacheId]);
  if (!line) throw new APIError(500, "Could not read the priced quote back. Refresh and try again.");
  return line;
}

// ── Customer ────────────────────────────────────────────────────────────────

export async function lookupCustomer(email: string): Promise<AssistedCustomerLookup> {
  const zones = (await listActiveDeliveryZones()).map((z) => ({ id: z.id, name: z.name, kind: z.kind, fee_ghs: z.fee_ghs }));
  const id = await findUserIdByEmail(email);
  if (!id) return { customer: null, addresses: [], zones };
  const [auth, profile, addresses] = await Promise.all([getAuthUser(id), getCustomerProfile(id), listDeliveryAddresses(id)]);
  return {
    customer: {
      id,
      email: auth?.email ?? email,
      first_name: profile?.first_name ?? null,
      last_name: profile?.last_name ?? null,
      phone: profile?.phone ?? null,
      role: profile?.role ?? "user",
    },
    addresses: addresses.map((a) => ({
      id: a.id,
      label: a.label,
      recipient_name: a.recipient_name,
      line1: a.line1,
      city: a.city,
      delivery_zone_id: a.delivery_zone_id,
      is_default: a.is_default,
    })),
    zones,
  };
}

/**
 * The customer's own account: found by email, or made with a confirmed email
 * and no password (they sign in later with an emailed code). Name and phone are
 * filled where the profile has none, never overwritten.
 */
async function ensureCustomer(input: PlaceAssistedOrderInput["customer"]): Promise<{ user: PlatformUser; created: boolean }> {
  let id = await findUserIdByEmail(input.email);
  let created = false;
  if (!id) {
    const made = await createPasswordlessAccount(input.email, { first_name: input.first_name, last_name: input.last_name });
    if (made.taken) id = await findUserIdByEmail(input.email);
    else if (!made.user) {
      logger.error("assisted order: account creation failed", { error: made.error });
      throw new APIError(500, "Could not create the customer's account");
    } else {
      id = made.user.id;
      created = true;
    }
  }
  if (!id) throw new APIError(500, "Could not find or create the customer's account");

  let profile = await getCustomerProfile(id);
  if (!profile) throw new APIError(500, "The customer's profile is missing. Try again in a moment.");
  if (profile.role !== "user") throw new APIError(409, "That email belongs to a staff account. Use the customer's own email.");

  const patch: Partial<Pick<CustomerProfileRow, "first_name" | "last_name" | "phone">> = {};
  if (!profile.first_name?.trim()) patch.first_name = input.first_name;
  if (!profile.last_name?.trim()) patch.last_name = input.last_name;
  if (!isContactPhone(profile.phone)) patch.phone = input.phone;
  if (Object.keys(patch).length > 0) {
    await updateCustomerProfile(id, patch);
    profile = { ...profile, ...patch };
  }

  const auth = await getAuthUser(id);
  if (!auth) throw new APIError(500, "Could not load the customer's account");
  return {
    created,
    user: {
      ...auth,
      profile: {
        id,
        role: profile.role as PlatformRoles,
        first_name: profile.first_name ?? undefined,
        last_name: profile.last_name ?? undefined,
        phone: profile.phone ?? null,
        created_at: new Date(profile.created_at),
        updated_at: new Date(profile.updated_at),
      },
    },
  };
}

async function deliveryFor(customerId: string, input: PlaceAssistedOrderInput["delivery"]): Promise<{ delivery_address_id?: string; delivery_zone_id?: string }> {
  switch (input.kind) {
    case "pickup":
      return { delivery_zone_id: input.delivery_zone_id };
    case "address": {
      const address = await getDeliveryAddressById(input.delivery_address_id);
      if (!address || address.user_id !== customerId) throw new APIError(400, "That address is not one of the customer's");
      return { delivery_address_id: address.id };
    }
    case "new_address": {
      const existing = await listDeliveryAddresses(customerId);
      const address = await insertDeliveryAddress(customerId, { ...input.address, is_default: existing.length === 0 });
      return { delivery_address_id: address.id };
    }
  }
}

// ── Place ───────────────────────────────────────────────────────────────────

/**
 * Staff place an order for a customer, under the customer's own account.
 *
 * The lines go into a fresh bag of their own (never the customer's open bag,
 * which is set aside for the minute this takes and put back after), and that
 * bag is checked out by the customer's checkout: every price, hold and size
 * rule a customer meets applies here too. Then either:
 * - `offline`: the payment staff received is recorded and settled, which sends
 *   the same "paid" email and notifications as a Paystack payment, plus a receipt
 *   for the whole order with how to sign in; or
 * - `pay_link`: the order waits unpaid (the unpaid-order sweep's clock runs) and
 *   the customer is emailed a link that signs them in to the order's Pay button.
 */
export async function placeAssistedOrder(admin: PlatformUser, input: PlaceAssistedOrderInput): Promise<PlacedAssistedOrder> {
  const { user: customer, created } = await ensureCustomer(input.customer);
  const delivery = await deliveryFor(customer.id, input.delivery);

  // A bag of its own, built as an anonymous session so nothing touches the customer's bag yet.
  const draft = { userId: null, sessionId: randomUUID() };
  for (const line of input.lines) {
    await addToBag(draft, {
      extraction_cache_id: line.extraction_cache_id,
      quantity: line.quantity,
      ...(line.special_instructions && { special_instructions: line.special_instructions }),
      ...(line.chosen_options && { chosen_options: line.chosen_options }),
    });
  }
  const draftCart = await findOpenSessionCart(draft.sessionId);
  if (!draftCart) throw new APIError(500, "Could not build the bag. Try again.");

  // One open cart per customer: set theirs aside while this one is checked out.
  const parked = await findOpenCart({ userId: customer.id, sessionId: null });
  if (parked && !(await setCartStatus(parked.id, "open", "abandoned"))) {
    throw new APIError(409, "The customer's bag changed just now. Try again.");
  }

  let checkout;
  try {
    if (!(await adoptCart(draftCart.id, customer.id))) throw new APIError(409, "Could not hand the bag to the customer. Try again.");
    checkout = await checkoutBag(customer, { userId: customer.id, sessionId: draft.sessionId }, {
      ...delivery,
      whatsapp_updates: input.whatsapp_updates,
    });
  } finally {
    // A failed checkout leaves the draft open under the customer: retire it before their own comes back.
    await setCartStatus(draftCart.id, "open", "abandoned").catch(() => false);
    if (parked) {
      await setCartStatus(parked.id, "abandoned", "open").catch((error: unknown) =>
        logger.error("assisted order: could not restore the customer's bag", {
          cartId: parked.id,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  await logAuditEvent({
    actorId: admin.id,
    actorRole: AUDIT_ACTOR_ROLES.ADMIN,
    action: "assisted_order_placed",
    entityType: AUDIT_ENTITY_TYPES.ORDER_GROUP,
    entityId: checkout.order_group_id,
    metadata: {
      customer_id: customer.id,
      customer_email: input.customer.email,
      account_created: created,
      order_ids: checkout.order_ids,
      total_ghs: checkout.total_ghs,
      placed_by: admin.email ?? admin.id,
      payment_mode: input.payment.mode,
    },
  });

  const firstOrderPath = `/app/orders/${checkout.order_ids[0]}`;
  let paymentReference: string | null = null;
  if (input.payment.mode === "offline") {
    try {
      const { payment } = await recordOfflineGroupPayment(admin.id, checkout.order_group_id, input.payment);
      paymentReference = payment.reference;
    } catch (error) {
      logger.error("assisted order: placed but the payment was not recorded", {
        orderGroupId: checkout.order_group_id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new APIError(500, `The order was placed (bag ${checkout.order_group_id.slice(0, 8)}) but the payment was not recorded. Record it from Transactions.`);
    }
  }

  const paid = input.payment.mode === "offline";
  const payWithinHours = paid ? undefined : (await resolvePaymentTimeouts().catch(() => null))?.unpaidOrderTtlHours;
  const emailedTo = await emailCustomer(customer, created, checkout.order_group_id, checkout.total_ghs, {
    kind: paid ? "paid" : "pay",
    paidWith: input.payment.mode === "offline" ? (PAID_WITH[input.payment.method] ?? "") : undefined,
    orderPath: firstOrderPath,
    payWithinHours,
  });

  return {
    customer_id: customer.id,
    account_created: created,
    status: paid ? "paid" : "awaiting_payment",
    emailed_to: emailedTo,
    order_group_id: checkout.order_group_id,
    order_ids: checkout.order_ids,
    total_ghs: checkout.total_ghs,
    payment_reference: paymentReference,
    whatsapp_href: whatsappHref({
      phone: customer.profile.phone ?? null,
      firstName: input.customer.first_name,
      totalGhs: checkout.total_ghs,
      email: input.customer.email,
      paid,
      next: paid ? "/app/orders" : firstOrderPath,
    }),
  };
}

const PAID_WITH: Record<string, string> = { momo: "Mobile Money", bank_transfer: "bank transfer", cash: "cash", card: "card" };

/**
 * The customer's email for this order, every item with its size and how to sign
 * in with this email: their receipt when they already paid us (sent alongside
 * the usual "paid" email, which names one item), or the link to sign in and pay
 * when they pay online. Never fails the placement; null when it was not sent.
 */
async function emailCustomer(
  customer: PlatformUser,
  created: boolean,
  groupId: string,
  totalGhs: number,
  opts: { kind: "paid" | "pay"; paidWith?: string; orderPath: string; payWithinHours?: number },
): Promise<string | null> {
  const email = customer.email;
  if (!email) return null;
  try {
    if (!(await mayEmailUser(customer.id))) return null;
    const orders = await listOrdersByGroup(createAdminClient(), groupId);
    const template = assistedOrderTemplate({
      kind: opts.kind,
      firstName: customer.profile.first_name ?? "there",
      email,
      items: orders.map((o) => ({
        name: o.product_name,
        quantity: o.quantity,
        options: formatChosenOptions(chosenOptionsOf(o.chosen_options)),
      })),
      totalGhs,
      paidWith: opts.paidWith,
      orderPath: opts.orderPath,
      payWithinHours: opts.payWithinHours,
      newAccount: created,
    });
    await sendEmail({ to: email, subject: template.subject, html: template.html, text: template.text });
    return email;
  } catch (error) {
    logger.error("assisted order: customer email failed", { groupId, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

/** wa.me to the customer with the message typed out; staff press send. */
export function whatsappHref(input: {
  phone: string | null;
  firstName: string;
  totalGhs: number;
  email: string;
  paid: boolean;
  next: string;
}): string | null {
  const digits = (input.phone ?? "").replace(/\D/g, "");
  if (digits.length < 9) return null;
  const link = `${env.app.url.replace(/\/$/, "")}/auth/login?next=${encodeURIComponent(input.next)}`;
  const total = `GH₵${input.totalGhs.toFixed(2)}`;
  const text = input.paid
    ? `Hi ${input.firstName}, this is Tomame. We've placed your order (${total}, paid). You'll get email updates as we buy and ship it. To follow it yourself, sign in with ${input.email} here: ${link} (we'll email you a code, no password needed).`
    : `Hi ${input.firstName}, this is Tomame. Your order is ready: ${total} all in. Sign in with ${input.email} to pay by MoMo or card: ${link} (we'll email you a code, no password needed). We've emailed you the details too.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
