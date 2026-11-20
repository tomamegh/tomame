import type { Metadata } from "next";

import { AdminPage } from "@/components/layout/admin";
import { QuoteCheckQueue } from "@/features/quote-checks/components/quote-check-queue";

export const metadata: Metadata = {
  title: "Stock checks · Admin",
};

/**
 * `/admin/stock-checks` (103, A7): renewed, used, low-stock and deal listings
 * a customer cannot pay for until someone confirms stock and condition on the
 * store. The queue is a client island over `/api/admin/quote-checks`.
 */
export default function AdminStockChecksPage() {
  return (
    <AdminPage
      title="Stock checks"
      blurb="Customers are told we confirm stock and condition before they pay. A confirmation holds for 24 hours."
    >
      <QuoteCheckQueue kind="stock" />
    </AdminPage>
  );
}
