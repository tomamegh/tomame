import { APIError } from "@/lib/auth/api-helpers";
import { logger } from "@/lib/logger";
import { getExtractionSnapshot } from "@/features/extraction/extraction.service";
import { gapFillOverrides, priceExtractionWith } from "@/features/extraction/quote.service";
import { loadPricingCalculator } from "@/features/pricing/services/pricing.service";
import { resolvePlatform } from "@/features/extraction/scrapers";
import { hashUrl, regionForUrl } from "@/features/extraction/url";
import { hasRequiredFields } from "@/features/extraction/resolvers/merge";
import { isSchemaMissingError } from "@/lib/supabase/errors";
import { extractionPricer, priceLowerOf, resolveLockForOrder } from "@/features/quotes/services/quote-lock.service";
import { QuoteConstantsMissingError } from "@/features/quotes/services/quote-constants.service";
import type { Viewer } from "@/features/quotes/types";
import { withProductDefaults, type ExtractionResult } from "@/features/extraction/types";
import type { PricingBreakdown } from "@/lib/pricing";
import type { CreateOrderSchemaType } from "../schema";
import type { OriginCountry } from "../types";

export interface OrderIntake {
  /**
   * The link the order is FOR. When a snapshot priced this order, this is the
   * snapshot's own URL, never the client's: the price and the product must name
   * the same thing, or a $13 snapshot id could be paired with a $2,000 link.
   */
  product_url: string;
  product_name: string;
  product_image_url: string | null;
  /** USD-normalised price used for pricing. */
  estimated_price_usd: number;
  origin_country: OriginCountry;
  pricing: PricingBreakdown;
  needs_review: boolean;
  review_reasons: string[];
  extraction_metadata: ExtractionResult | null;
  extraction_cache_id: string | null;
  /** The unexpired lock this order was priced under; createOrder consumes it after insert. */
  rate_lock_id: string | null;
}

/**
 * The trust boundary between a customer's form and an order row.
 *
 * Takes the client's request and the server-owned extraction snapshot, and
 * decides every money-relevant field itself. The client can name the product,
 * pick a quantity and leave instructions. It can supply a price or region only
 * to fill a gap the extraction left, and doing so flags the order for review.
 *
 * The viewer's unexpired rate lock (resolved from the session, never the body)
 * decides the FX: the customer pays the lower of the locked and live total. An
 * expired or absent lock means today's rate. The lock's stored `pricing`
 * snapshot is never a price source — only the live snapshot or a flagged
 * customer gap-filler is.
 */
export async function buildOrderIntake(
  input: CreateOrderSchemaType,
  viewer: Viewer,
  /**
   * A buyer's verified item price (065), from the cart line. Never from the
   * request body — see `CreateOrderLinks.sourced_price_usd`.
   */
  sourcedPriceUsd: number | null = null,
  /**
   * The origin country the SAME buyer established, when they answered a sourcing
   * request. Passed explicitly rather than inferred from `input.origin_country`,
   * which carries the customer's own gap-filler and means something different.
   */
  sourcedOriginCountry: OriginCountry | null = null,
): Promise<OrderIntake> {
  const platform = resolvePlatform(input.product_url);
  if (!platform) throw new APIError(400, "We currently do not support this store. Please try again");

  const snapshot = input.extraction_cache_id ? await getExtractionSnapshot(input.extraction_cache_id) : null;
  if (input.extraction_cache_id && !snapshot) {
    logger.warn("order intake: extraction snapshot not found", { id: input.extraction_cache_id });
  }
  const extraction = snapshot?.result ?? null;
  const product = extraction?.product ?? null;

  const reasons: string[] = [];

  // ── The link ─────────────────────────────────────────────────────────────
  // The snapshot's URL is authoritative whenever a snapshot priced the order.
  // A client link that names a different product is kept out of the order and
  // flagged: legitimately a short link or a variant, illegitimately an attempt
  // to buy one product at another's price. Either way a person looks first.
  const productUrl = snapshot?.productUrl ?? input.product_url;
  if (snapshot && hashUrl(input.product_url) !== hashUrl(snapshot.productUrl)) {
    logger.warn("order intake: client link differs from priced snapshot", {
      extraction_cache_id: snapshot.id,
    });
    reasons.push("Link pasted differs from the priced product; the priced product's link was kept.");
  }

  // ── Price ────────────────────────────────────────────────────────────────
  // Server snapshot wins; the client's estimate only fills a gap, and is flagged.
  let priceOverrideUsd: number | undefined;
  if (sourcedPriceUsd != null && sourcedPriceUsd > 0) {
    // A BUYER'S PRICE OUTRANKS THE SNAPSHOT. This is the one override that is
    // allowed to beat a scraped figure, because it is the only one a person
    // verified against the store — and on these orders the scraped figure came
    // off a page the extractor does not understand. It cannot arrive from a
    // request body; `createOrder` reads it off the cart line.
    priceOverrideUsd = sourcedPriceUsd;
    /*
      DELIBERATELY NOT A REVIEW REASON.

      `reasons` is not a notes field — `needs_review` is literally
      `reasons.length > 0`, and `groupCharge` refuses to charge a bag holding any
      order that is flagged with no `admin_total_ghs` set. Recording the buyer's
      confirmation here would therefore have made every sourced order unpayable:
      the customer asks us to source something, a buyer prices it, the bag prices
      correctly, and then checkout answers "this bag is waiting for our review
      before it can be paid" about the one item a human had already reviewed.

      The flag means "carries a total nobody verified" (payments.service.ts). A
      buyer's price is the opposite of that, so it is the one override that must
      NOT set it. The provenance is not lost: it is on the `price_watches` row
      (`sourced_price_usd`, `reviewed_by`, `reviewed_at`) and in `audit_logs`
      under `sourcing_marked_available`, both of which outlive the order.
    */
    logger.info("order intake: pricing from a buyer's verified figure", {
      extraction_cache_id: snapshot?.id ?? null,
      sourced_price_usd: sourcedPriceUsd,
    });
  } else if (product?.price != null && product.price > 0) {
    // Snapshot has a price; the client's estimate is ignored.
  } else if (input.estimated_price_usd != null) {
    priceOverrideUsd = input.estimated_price_usd;
    reasons.push("Price entered by customer, not verified against the store.");
  } else {
    throw new APIError(400, "We couldn't read a price for this product. Please enter the item price.");
  }

  // ── Region ───────────────────────────────────────────────────────────────
  let country: OriginCountry | null = extraction?.country ?? regionForUrl(input.product_url);
  if (!country && sourcedOriginCountry) {
    /*
      A BUYER ESTABLISHED THIS, SO IT DOES NOT FLAG EITHER.

      An unrecognised region is the commonest reason a sourcing request exists at
      all, so this branch is reached by nearly every one of them. Falling through
      to the customer-selected case below would push a reason, set `needs_review`
      and leave the bag unpayable — the same trap the price override above
      describes, one block further down, and it survived the first fix because
      the flag came from a different sentence.
    */
    country = sourcedOriginCountry;
  } else if (!country) {
    if (!input.origin_country) throw new APIError(400, "Please select the country this item ships from.");
    country = input.origin_country;
    reasons.push("Origin country selected by customer; store region not recognised.");
  }

  // ── Extraction quality ───────────────────────────────────────────────────
  if (!extraction || !product) {
    reasons.push("Order placed without automatic product extraction.");
  } else if (!hasRequiredFields(product)) {
    reasons.push("Automatic extraction was incomplete.");
  }
  if (product && product.title && input.product_name.trim() !== product.title.trim()) {
    reasons.push("Customer edited the product name.");
  }

  // ── Pricing (server-side, from the snapshot) ─────────────────────────────
  const pricingBase: ExtractionResult = {
    ...(extraction ?? {
      extraction_attempted: false,
      extraction_success: false,
      platform,
      product: withProductDefaults({
        title: input.product_name,
        image: input.product_image_url ?? null,
      }),
      messages: [],
      errors: [],
      source: null,
      sources: [],
      confidence: {},
      fetched_at: new Date().toISOString(),
    }),
    country,
  };

  // `gapFillOverrides` would drop a buyer's price whenever the snapshot has one
  // of its own, which is exactly the case it exists for; built directly here.
  const overrides =
    sourcedPriceUsd != null && sourcedPriceUsd > 0
      ? { itemPriceUsd: sourcedPriceUsd }
      : gapFillOverrides(pricingBase, priceOverrideUsd);
  const calculator = await loadPricingCalculator();
  const live = await priceExtractionWith(calculator, pricingBase, input.quantity, overrides, null);
  if (!live.pricing) {
    throw new APIError(503, live.reason ?? "Pricing is temporarily unavailable. Please try again shortly.");
  }

  // ── Rate lock ────────────────────────────────────────────────────────────
  // A transient lock failure must never block an order: the customer is priced
  // live with no lock. A missing table or a missing seeded constant is a deploy
  // bug and surfaces.
  let pricing = live.pricing;
  let rateLockId: string | null = null;
  if (snapshot) {
    try {
      const lock = await resolveLockForOrder(viewer, snapshot.id);
      if (lock) {
        pricing = await priceLowerOf({
          lock,
          live: live.pricing,
          priceAt: extractionPricer(calculator, pricingBase, input.quantity, overrides),
          onLiveWins: { ratchet: true, actorId: viewer.userId },
        });
        rateLockId = lock.id;
      }
    } catch (err) {
      if (isSchemaMissingError(err) || err instanceof QuoteConstantsMissingError) throw err;
      logger.error("order intake: rate lock failed, pricing live", {
        extraction_cache_id: snapshot.id,
        error: err instanceof Error ? err.message : String(err),
      });
      pricing = live.pricing;
      rateLockId = null;
    }
  }
  if (pricing.pricing_method === "needs_review") {
    reasons.push(pricing.review_reason ?? "Pricing could not be determined");
  }

  return {
    product_url: productUrl,
    product_name: input.product_name,
    product_image_url: input.product_image_url ?? product?.image ?? null,
    estimated_price_usd: pricing.item_price_usd,
    origin_country: country,
    pricing,
    needs_review: reasons.length > 0,
    review_reasons: reasons,
    extraction_metadata: extraction,
    extraction_cache_id: snapshot?.id ?? null,
    rate_lock_id: rateLockId,
  };
}
