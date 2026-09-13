import { Badge } from "@/components/ui/badge";
import { JOURNEY_TONE_BADGE_CLASS, journeyStageFor } from "../services/journey-stage";
import type { OrderStatus } from "../types";

/**
 * One order status, in the product's own words and colour.
 *
 * Both come from `journey-stage.ts`, which is the single place a status becomes
 * words. This file used to carry its own seven-entry map — one of five copies
 * that had already drifted ("In Transit" here, "In the air" on the customer's
 * journey) — so a buyer and a customer reading the same order saw two different
 * vocabularies.
 */
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const stage = journeyStageFor(status);
  return (
    <Badge variant="outline" className={JOURNEY_TONE_BADGE_CLASS[stage.tone]}>
      {stage.label}
    </Badge>
  );
}
