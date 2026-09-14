import type { Metadata } from "next";

import { AdminCard, AdminPage, AdminStat } from "@/components/layout/admin";
import { listAdminTransactions } from "@/db/queries/admin-money";
import {
  formatPesewas,
  summariseTransactions,
} from "@/features/payments/components/admin-money-format";
import { AdminTransactionsView } from "@/features/payments/components/admin-transactions-view";

/**
 * `/admin/transactions` — every Paystack charge on the platform.
 *
 * Server-rendered: the ledger is read with the service-role client inside
 * `db/queries/admin-money`, so the browser is never handed a query that could
 * be re-pointed, and the page is there on first paint instead of after a
 * spinner. The only client work is filtering rows that already arrived.
 *
 * The `/admin` layout is what authorises this route; `src/proxy.ts` gates the
 * whole `/admin` prefix as well.
 */

export const metadata: Metadata = {
  title: "Transactions · Tomame admin",
};

/**
 * Never cached. A charge that settled a minute ago must show as settled, and a
 * ledger served from the build's data would tell an admin the opposite.
 */
export const dynamic = "force-dynamic";

/** The newest N charges. Deep history is a reporting job, not a screen. */
const LEDGER_WINDOW = 200;

export default async function AdminTransactionsPage() {
  const rows = await listAdminTransactions(LEDGER_WINDOW);
  const summary = summariseTransactions(rows);
  const renderedAt = new Date().toISOString();

  return (
    <AdminPage
      title="Transactions"
      blurb="Every Paystack charge, what it bought, and whether Paystack has actually confirmed it."
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStat
          label="Settled"
          value={formatPesewas(summary.settledPesewas)}
          detail={`${summary.settled} of ${summary.total} charges in this window`}
          tone="green"
          index={0}
        />
        <AdminStat
          label="Charges"
          value={String(summary.total)}
          detail={rows.length >= LEDGER_WINDOW ? `Newest ${LEDGER_WINDOW}` : "All time"}
          index={1}
        />
        <AdminStat
          label="Unsettled"
          value={String(summary.unsettled)}
          detail={
            summary.unsettled > 0
              ? "Nothing has confirmed these; open one and re-verify"
              : "Nothing waiting on a confirmation"
          }
          tone={summary.unsettled > 0 ? "amber" : "muted"}
          index={2}
        />
        <AdminStat
          label="Failed"
          value={String(summary.failed)}
          detail="Paystack declined or the customer abandoned the charge"
          tone="muted"
          index={3}
        />
      </div>

      {summary.unsettled > 0 ? (
        <AdminCard index={2}>
          <p className="text-[13px] leading-[1.55] font-medium text-tm-text-2">
            <span className="font-semibold text-tm-ink">
              {summary.unsettled} {summary.unsettled === 1 ? "charge is" : "charges are"} unsettled.
            </span>{" "}
            An unsettled charge has never been confirmed by Paystack, so the orders behind it are
            still unpaid. Open one and re-verify against Paystack to find out what really happened.
          </p>
        </AdminCard>
      ) : null}

      <AdminTransactionsView rows={rows} limit={LEDGER_WINDOW} renderedAt={renderedAt} />
    </AdminPage>
  );
}
