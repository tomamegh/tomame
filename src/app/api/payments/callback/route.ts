import { NextRequest, NextResponse } from "next/server";
import { paymentCallbackSchema } from "@/features/payments/schema";
import {
  handlePaymentCallback,
  unresolvedPaymentUrl,
} from "@/features/payments/services/payments.service";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get("reference");

  const parsed = paymentCallbackSchema.safeParse({ reference });
  if (!parsed.success) {
    logger.warn("Invalid payment callback reference", { reference });
    return NextResponse.redirect(unresolvedPaymentUrl());
  }

  try {
    const { redirectUrl } = await handlePaymentCallback(parsed.data.reference);
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    logger.error("Payment callback processing failed", {
      reference: parsed.data.reference,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.redirect(unresolvedPaymentUrl());
  }
}
