import type { Metadata } from "next";

import { AdminPage } from "@/components/layout/admin";
import { QuoteCheckQueue } from "@/features/quote-checks/components/quote-check-queue";

export const metadata: Metadata = {
  title: "Price checks · Admin",
};

/**
 * `/admin/price-checks` (103, A0): prices the pipeline could not confirm
 * (page-only reads, disagreeing tiers, coupons, used offers) and "Report a
 * wrong price" from customers. Confirm, or correct the quote to the store's
 * price; both are audited.
 */
export default function AdminPriceChecksPage() {
  return (
    <AdminPage
      title="Price checks"
      blurb="Customers see “We're confirming this price” and cannot pay until a price here is confirmed or corrected."
    >
      <QuoteCheckQueue kind="price" />
    </AdminPage>
  );
}
