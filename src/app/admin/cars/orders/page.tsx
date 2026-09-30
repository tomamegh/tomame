import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import {
  AdminCard,
  AdminEmpty,
  AdminFilterPills,
  AdminPage,
  AdminStat,
  type AdminFilterPill,
} from "@/components/layout/admin";
import { CAR_ORDER_STATUSES } from "@/features/cars/car-orders.types";
import { formatPesewas } from "@/features/cars/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSchemaMissingError } from "@/lib/supabase/errors";

import { readCarOrderMoney, readPriceOrigin, type CarOrderPayment } from "./car-order-money";
import { CarSalesBoard, type AdminCarSale } from "./car-sales-board";

export const metadata: Metadata = {
  title: "Car sales · Admin",
  description: "Who bought which car, what they have paid, and what is still owing.",
};

/**
 * `/admin/cars/orders` — the sales (migrations 068, 069).
 *
 * WHY THIS SCREEN EXISTS. `car_orders` had no admin surface of any kind: a
 * customer could buy a vehicle and the only way to see it was a SQL client. That
 * was survivable while a car was one charge that either succeeded or did not.
 * It stopped being survivable the moment the money started arriving in two
 * parts. A car is GH₵120,000 to GH₵260,000 and no Ghanaian mobile money wallet
 * carries that in one transaction, so Paystack takes a deposit and the rest is
 * settled by bank transfer or in person. The rest arriving is AN EVENT NOBODY IS
 * TOLD ABOUT: there is no webhook for a bank transfer, so a person has to notice
 * it and write it down, and this is where.
 *
 * WHAT A ROW HAS TO ANSWER, and why each part is on it. The car and the
 * customer, because a balance is chased by phoning somebody about a vehicle. The
 * agreed price, the deposit taken and what is still out, because that is the
 * question. WHERE THE PRICE CAME FROM, because an on-request car carries no
 * public price at all and a negotiable one may have sold below its listing: an
 * admin who does not know that a figure was agreed in a conversation will
 * "correct" it against the listing and chase a customer for money they never
 * owed. And when each of those things happened, because a sale that has sat at
 * "balance due" for three weeks is a different conversation from one that got
 * there this morning.
 *
 * WHY THE READS ARE HERE RATHER THAN IN `db/queries/car-orders.ts`. That module
 * has no admin list function and belongs to the purchase path, which was being
 * written at the same time as this screen. The same call `/admin/cars` makes for
 * its cover photographs: a service-role read in the page, with the row/view
 * boundary applied by hand before anything crosses to the client island. If an
 * admin list lands in the query layer, this collapses into it.
 *
 * WHY EVERY LIVE SALE IS FETCHED AND THEN COUNTED IN MEMORY, which
 * `/admin/orders` explicitly refuses to do for parcels. A car order is one
 * physical vehicle shipped across an ocean; the ceiling on live ones is tens,
 * not tens of thousands, and {@link MAX_ROWS} is an order of magnitude above
 * anything the business can hold at once. In exchange the figures on the tiles
 * are exact rather than "of the fifty shown", which on a screen about
 * outstanding money is the difference between a total somebody can act on and
 * one they cannot.
 *
 * `src/proxy.ts` has already established that the caller is an admin before this
 * renders; there is deliberately no second check here (see `admin/layout.tsx`).
 */

const MAX_ROWS = 250;

type SaleFilter = "live" | "due" | "awaiting" | "settled" | "unwound";

export default async function AdminCarOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filter = readFilter(single(params.status));

  const [rows, cancelledCount] = await Promise.all([
    // The unwound view is its own read: cancelled sales accumulate forever and
    // there is no reason to carry them through every other view's arithmetic.
    readCarOrders(filter === "unwound"),
    countCancelled(),
  ]);

  // A DATABASE WITHOUT THE TABLE IS SAID OUT LOUD, and is NOT an empty queue.
  // This is the state a deploy-before-migrate produces, and it is the one the
  // screen was first opened in. "Nobody owes a balance" would be a lie told on
  // the screen where money is chased; a 500 with "Something went wrong" tells an
  // admin nothing they can act on. So it gets a sentence of its own.
  if (rows === null) {
    return (
      <AdminPage
        title="Car sales"
        blurb="Every vehicle somebody has bought or reserved."
        action={
          <Link
            href="/admin/cars"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-tm-border bg-card px-4 text-[13px] font-semibold text-tm-text-2 transition-colors hover:bg-tm-paper"
          >
            <ArrowLeftIcon className="size-4" aria-hidden />
            Back to cars
          </Link>
        }
      >
        <AdminCard index={0} title="This database has no car sales table">
          <AdminEmpty
            title="Nothing can be read yet"
            body="The migrations that create car sales have not been applied to this database, so there is no queue here rather than an empty one. Nobody has been told anything about their money by this screen, and no figure on it should be trusted until the migrations land."
          />
        </AdminCard>
      </AdminPage>
    );
  }

  const sales = await resolve(rows);

  const due = sales.filter((sale) => sale.money.awaitingBalance);
  const awaiting = sales.filter(
    (sale) => sale.status === CAR_ORDER_STATUSES.PENDING_PAYMENT,
  );
  const settled = sales.filter((sale) => sale.money.fullyPaid);
  const outstanding = due.reduce((sum, sale) => sum + sale.money.outstandingPesewas, 0);

  const shown = selectFor(filter, { sales, due, awaiting, settled });

  return (
    <AdminPage
      title="Car sales"
      blurb="Every vehicle somebody has bought or reserved. The deposit arrives through Paystack; the balance arrives by bank transfer or in person, and a person records it here."
      action={
        <Link
          href="/admin/cars"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-tm-border bg-card px-4 text-[13px] font-semibold text-tm-text-2 transition-colors hover:bg-tm-paper"
        >
          <ArrowLeftIcon className="size-4" aria-hidden />
          Back to cars
        </Link>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <AdminStat
          index={0}
          label="Balance to collect"
          value={formatPesewas(outstanding)}
          detail={
            due.length === 0
              ? "Nobody owes a balance right now"
              : `Across ${due.length} ${due.length === 1 ? "sale" : "sales"} whose deposit is in`
          }
          tone={due.length > 0 ? "coral" : "green"}
          href="/admin/cars/orders?status=due"
        />
        <AdminStat
          index={1}
          label="Awaiting a deposit"
          value={`${awaiting.length}`}
          detail={
            awaiting.length === 0
              ? "No car is being checked out"
              : "Reserved, with no money in yet"
          }
          tone={awaiting.length > 0 ? "neutral" : "muted"}
          href="/admin/cars/orders?status=awaiting"
        />
        <AdminStat
          index={2}
          label="Paid in full"
          value={`${settled.length}`}
          detail={
            cancelledCount > 0
              ? `${cancelledCount} ${cancelledCount === 1 ? "sale has" : "sales have"} been unwound`
              : "Nothing owing on these"
          }
          tone={settled.length > 0 ? "green" : "muted"}
          href="/admin/cars/orders?status=settled"
        />
      </div>

      {/*
        The pills are a row of their own rather than the page's `action` slot,
        which the kit wraps in a `shrink-0` flex item: a shrink-0 group does not
        wrap, it overflows, and five pills is wider than a 390px screen. Same
        placement `/admin/orders` and the enquiry queue use.
      */}
      <AdminFilterPills
        pills={buildPills(filter, {
          due: due.length,
          awaiting: awaiting.length,
          cancelled: cancelledCount,
        })}
        label="Filter car sales by what is owed"
      />

      <AdminCard
        index={0}
        title={CARD_TITLE[filter]}
        blurb="Newest first. Recording a balance writes down money that arrived somewhere else: it charges nobody and moves nothing."
      >
        {shown.length === 0 ? (
          <AdminEmpty title={EMPTY_TITLE[filter]} body={EMPTY_BODY[filter]}>
            {filter === "live" ? null : (
              <Link
                href="/admin/cars/orders"
                className="mt-1 inline-flex h-9 items-center rounded-full border border-tm-border bg-card px-4 text-[13px] font-semibold text-tm-text-2 transition-colors hover:bg-tm-paper"
              >
                Show every live sale
              </Link>
            )}
          </AdminEmpty>
        ) : (
          <CarSalesBoard sales={shown} />
        )}
      </AdminCard>

      {rows.length >= MAX_ROWS ? (
        <p className="text-[12px] leading-[1.4] font-medium text-tm-text-3">
          Showing the newest <span className="tm-nums">{MAX_ROWS}</span>. There are more sales
          than this screen was built to hold at once, and the figures above cover only what is
          shown.
        </p>
      ) : null}
    </AdminPage>
  );
}

// ── Reads ───────────────────────────────────────────────────────────────────

/**
 * The raw `car_orders` rows.
 *
 * `select("*")` RATHER THAN A COLUMN LIST, which is the one place this file
 * departs from the house pattern, and deliberately. The purchase path gained
 * eight columns in 069 and is still moving; a column list here would freeze the
 * screen at the shape of the table on the day it was written, and naming a
 * column before its migration landed would fail the whole read with a PostgREST
 * error rather than degrade. Nothing selected reaches the browser unread:
 * `resolve` maps every row into {@link AdminCarSale} by hand, so a column
 * arriving cannot become a field crossing to a client component by accident.
 */
async function readCarOrders(
  cancelledOnly: boolean,
): Promise<Record<string, unknown>[] | null> {
  const db = createAdminClient();
  const query = db
    .from("car_orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  const { data, error } = await (cancelledOnly
    ? query.eq("status", CAR_ORDER_STATUSES.CANCELLED)
    : query.neq("status", CAR_ORDER_STATUSES.CANCELLED));

  // Null for a MISSING TABLE only, which the caller turns into a sentence. Every
  // other failure throws: a read that fell over for any other reason must not be
  // dressed up as a schema that has not landed, and must certainly not be drawn
  // as a screen with no sales on it.
  if (error) {
    if (isSchemaMissingError(error)) return null;
    throw new Error(`Failed to load the car sales: ${error.message}`);
  }
  return (data ?? []) as Record<string, unknown>[];
}

/** Count only: the unwound sales are a number on a tile until somebody asks for them. */
async function countCancelled(): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("car_orders")
    .select("id", { count: "exact", head: true })
    .eq("status", CAR_ORDER_STATUSES.CANCELLED);
  // A tile is decoration on a page that has already rendered, and this is the
  // same call `getAdminQueueCounts` makes: a count failing must not take the
  // screen down.
  return error ? 0 : (count ?? 0);
}

/**
 * The car, the customer and the Paystack history behind each sale, in four
 * queries rather than four per row.
 *
 * A LOOKUP THAT FAILS DOES NOT FAIL THE SCREEN, on the same reasoning the
 * enquiry queue gives: the sale itself carries the label, every figure and the
 * status, and losing all of it because the auth service hiccuped while fetching
 * an email address is the worse outcome. The one exception is the payments read,
 * whose failure would silently draw an empty Paystack history under a sale that
 * has one, which is the panel an admin uses to decide whether a deposit really
 * landed. That one throws.
 */
async function resolve(rows: readonly Record<string, unknown>[]): Promise<AdminCarSale[]> {
  if (rows.length === 0) return [];

  const db = createAdminClient();
  const orderIds = rows.map((row) => String(row.id));
  const listingIds = [...new Set(rows.map((row) => String(row.car_listing_id)))];
  const userIds = [...new Set(rows.map((row) => String(row.user_id)))];

  const [payments, listings, profiles, emails] = await Promise.all([
    (async (): Promise<Record<string, unknown>[]> => {
      const { data, error } = await db
        .from("payments")
        .select("id, car_order_id, amount, status, channel, reference, created_at")
        .in("car_order_id", orderIds)
        .order("created_at", { ascending: true });
      if (error) throw new Error(`Failed to load the car payments: ${error.message}`);
      return (data ?? []) as Record<string, unknown>[];
    })(),
    (async (): Promise<Record<string, unknown>[]> => {
      const { data, error } = await db
        .from("car_listings")
        .select("id, price_state, price_pesewas, is_published")
        .in("id", listingIds);
      return error ? [] : ((data ?? []) as Record<string, unknown>[]);
    })(),
    (async (): Promise<Record<string, unknown>[]> => {
      const { data, error } = await db
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", userIds);
      return error ? [] : ((data ?? []) as Record<string, unknown>[]);
    })(),
    Promise.all(
      userIds.map(async (id): Promise<readonly [string, string | null]> => {
        try {
          const { data } = await db.auth.admin.getUserById(id);
          return [id, data.user?.email ?? null];
        } catch {
          return [id, null];
        }
      }),
    ),
  ]);

  const paymentsByOrder = new Map<string, CarOrderPayment[]>();
  for (const row of payments) {
    const key = String(row.car_order_id);
    const entry: CarOrderPayment = {
      id: String(row.id),
      // `Number(...)` and not a cast: PostgREST widens numerics to strings often
      // enough in this codebase that `db/queries/car-orders.ts` normalises every
      // one of them, and an amount that arrived as "5550000" would be
      // concatenated somewhere rather than added.
      amountPesewas: Number(row.amount),
      status: String(row.status),
      channel: (row.channel as string | null) ?? null,
      reference: String(row.reference),
      createdAt: String(row.created_at),
    };
    const bucket = paymentsByOrder.get(key);
    if (bucket) bucket.push(entry);
    else paymentsByOrder.set(key, [entry]);
  }

  const listingById = new Map(listings.map((row) => [String(row.id), row]));
  const profileById = new Map(profiles.map((row) => [String(row.id), row]));
  const emailById = new Map(emails);

  return rows.map((row): AdminCarSale => {
    const id = String(row.id);
    const carListingId = String(row.car_listing_id);
    const userId = String(row.user_id);
    const listing = listingById.get(carListingId) ?? null;
    const profile = profileById.get(userId) ?? null;

    const pricePesewas = Number(row.price_pesewas);
    const money = readCarOrderMoney({
      status: String(row.status),
      pricePesewas,
      depositPesewas: Number(row.deposit_pesewas),
      depositPercent: Number(row.deposit_percent),
      balancePesewas: Number(row.balance_pesewas),
      balanceAmountPesewas: nullableInt(row.balance_amount_pesewas),
      depositPaidAt: (row.deposit_paid_at as string | null) ?? null,
    });

    const name = [profile?.first_name, profile?.last_name]
      .map((part) => (typeof part === "string" ? part.trim() : ""))
      .filter(Boolean)
      .join(" ");

    return {
      id,
      status: String(row.status),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      depositPaidAt: (row.deposit_paid_at as string | null) ?? null,
      paidAt: (row.paid_at as string | null) ?? null,
      cancelledAt: (row.cancelled_at as string | null) ?? null,
      cancelReason: (row.cancel_reason as string | null) ?? null,
      balanceNote: (row.balance_note as string | null) ?? null,
      // The label snapshotted on the order rather than the listing's title
      // today: the car is named as it read on the day it was sold.
      carLabel: String(row.car_label ?? "") || "A car",
      carListingId,
      listingIsPublished: listing ? Boolean(listing.is_published) : null,
      carEnquiryId: (row.car_enquiry_id as string | null) ?? null,
      customer: {
        id: userId,
        // Never a raw uuid on screen. A customer with no name on their profile
        // is ordinary, so the email is the fallback and the id the last resort.
        name: name.length > 0 ? name : null,
        email: emailById.get(userId) ?? null,
      },
      money,
      payments: paymentsByOrder.get(id) ?? [],
      origin: readPriceOrigin({
        source: String(row.price_source ?? ""),
        pricePesewas,
        listingPricePesewas: listing ? nullableInt(listing.price_pesewas) : null,
      }),
    };
  });
}

function nullableInt(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// ── The filter ──────────────────────────────────────────────────────────────

/**
 * Anything unrecognised means every live sale, so a stale bookmark shows the
 * board rather than an error. The same call `/admin/cars` makes with its own.
 */
function readFilter(raw: string | undefined): SaleFilter {
  if (raw === "due" || raw === "awaiting" || raw === "settled" || raw === "unwound") return raw;
  return "live";
}

function selectFor(
  filter: SaleFilter,
  sets: {
    sales: AdminCarSale[];
    due: AdminCarSale[];
    awaiting: AdminCarSale[];
    settled: AdminCarSale[];
  },
): AdminCarSale[] {
  switch (filter) {
    case "due":
      return sets.due;
    case "awaiting":
      return sets.awaiting;
    case "settled":
      return sets.settled;
    // The unwound read already returned exactly the cancelled rows.
    case "unwound":
      return sets.sales;
    default:
      return sets.sales;
  }
}

function buildPills(
  filter: SaleFilter,
  counts: { due: number; awaiting: number; cancelled: number },
): AdminFilterPill[] {
  return [
    { label: "Live sales", href: "/admin/cars/orders", active: filter === "live" },
    {
      // The pill that matters: it is the figure the sidebar badge shows and the
      // only one on this screen that is work rather than a record.
      label: "Balance due",
      href: "/admin/cars/orders?status=due",
      active: filter === "due",
      count: counts.due,
    },
    {
      label: "Awaiting deposit",
      href: "/admin/cars/orders?status=awaiting",
      active: filter === "awaiting",
      count: counts.awaiting,
    },
    {
      label: "Paid in full",
      href: "/admin/cars/orders?status=settled",
      active: filter === "settled",
    },
    {
      label: "Unwound",
      href: "/admin/cars/orders?status=unwound",
      active: filter === "unwound",
      count: counts.cancelled,
    },
  ];
}

// ── Words ───────────────────────────────────────────────────────────────────

const CARD_TITLE: Record<SaleFilter, string> = {
  live: "Every live sale",
  due: "Waiting on a balance",
  awaiting: "Waiting on a deposit",
  settled: "Paid in full",
  unwound: "Sales that were unwound",
};

const EMPTY_TITLE: Record<SaleFilter, string> = {
  live: "No car has been bought yet",
  due: "Nobody owes a balance",
  awaiting: "No car is being checked out",
  settled: "No sale has been paid in full yet",
  unwound: "No sale has been unwound",
};

const EMPTY_BODY: Record<SaleFilter, string> = {
  live:
    "A sale starts when a customer pays a deposit on a published car. Until one does, there is nothing to chase and nothing to record.",
  due:
    "Every deposit taken so far has been followed by its balance. This is the queue that matters on this screen, so an empty one is the good outcome.",
  awaiting:
    "Nobody is part way through a Paystack page. A checkout that is abandoned is released automatically about an hour later, which puts the car back on the market.",
  settled:
    "Nothing has been paid off in full. A sale lands here once the deposit has settled and somebody has recorded the balance that arrived offline.",
  unwound:
    "No sale has been reversed. A sale is unwound when a buyer walks away or a vehicle is damaged, which frees the car to be sold again.",
};

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
