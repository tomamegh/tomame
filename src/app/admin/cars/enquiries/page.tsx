import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import {
  AdminCard,
  AdminEmpty,
  AdminFilterPills,
  AdminPage,
  type AdminFilterPill,
} from "@/components/layout/admin";
import { getAdminQueueCounts } from "@/db/queries/admin-queues";
import { CAR_ENQUIRY_STATUSES, type CarEnquiryStatus } from "@/config/constants";
import { carTitle } from "@/features/cars/format";
import { listCarEnquiriesForAdmin } from "@/features/cars/services/cars.service";
import { createAdminClient } from "@/lib/supabase/admin";

import { EnquiryQueue } from "./enquiry-queue";
import type { AdminCarEnquiry } from "./enquiry-queue";

export const metadata: Metadata = {
  title: "Car enquiries · Tomame admin",
  description: "Customers asking what a car costs, and customers making an offer.",
};

/**
 * `/admin/cars/enquiries` — people waiting to be told a price (migration 067).
 *
 * WHAT A ROW IS. Either a PRICE REQUEST against a car we deliberately listed
 * without a figure, or an OFFER against one we listed as negotiable. The two are
 * different conversations and the service will not let them be swapped: an offer
 * can only be made on a `negotiable` listing and a price request only on an
 * `on_request` one, because a fixed price is not a negotiation and there is
 * nothing to ask.
 *
 * ACCEPTING AN OFFER TAKES NO MONEY. It records that a human said yes, and
 * stops. There is no order, no payment and no state machine behind it — buying a
 * car is a later phase pending a product decision about deposits and about what
 * happens to a customer's money while a vehicle is mid-ocean. Migration 067's
 * header and `cars.service.ts` both say so at length, and the copy on this
 * screen must never imply otherwise.
 *
 * WHY THE SERVER FETCHES AND A CLIENT ISLAND ANSWERS. A raw enquiry row carries
 * a `car_listing_id` and a `user_id` and nothing a person can read, so the car
 * and the customer are resolved here, once, in two `IN` queries rather than two
 * per row. Answering is the opposite shape — a figure to type and a decision to
 * make per row, against a guarded transition that 409s when another admin gets
 * there first — so that half is the island.
 *
 * THE FILTER LIVES IN THE URL, so "everything waiting" is a view an admin can
 * bookmark or send to a colleague, and so the sidebar badge has somewhere to
 * point.
 */

const PAGE_SIZE = 50;

export default async function AdminCarEnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = single(params.status);
  // No parameter at all means the work: `open` is what an admin opens this for.
  // Anything unrecognised means everything, so a stale bookmark shows the queue
  // rather than an error — the same call `/admin/feedback` makes.
  const status: CarEnquiryStatus | "all" = raw
    ? ((Object.values(CAR_ENQUIRY_STATUSES).find((value) => value === raw) as
        | CarEnquiryStatus
        | undefined) ?? "all")
    : CAR_ENQUIRY_STATUSES.OPEN;
  const carFilter = single(params.car);

  const [{ enquiries, total }, counts] = await Promise.all([
    listCarEnquiriesForAdmin({
      status: status === "all" ? undefined : status,
      carListingId: carFilter,
      limit: PAGE_SIZE,
    }),
    getAdminQueueCounts(),
  ]);

  const rows = await resolve(enquiries);
  const filteredCar = carFilter ? rows[0]?.car ?? null : null;

  return (
    <AdminPage
      title="Car enquiries"
      blurb="Someone asking what a car costs, or offering a figure for one. Answering is a reply and a price: it does not take any money and does not create an order."
      action={
        <>
          <Link
            href="/admin/cars"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-tm-border bg-card px-4 text-[13px] font-semibold text-tm-text-2 transition-colors hover:bg-tm-paper"
          >
            <ArrowLeftIcon className="size-4" aria-hidden />
            Back to cars
          </Link>
        </>
      }
    >
      {/*
        The pills are a row of their own rather than page `action`, which the kit
        wraps in a `shrink-0` flex item: five of them plus a link is wider than a
        390px screen, and a shrink-0 group does not wrap — it overflows. Same
        placement `/admin/orders` uses.
      */}
      <AdminFilterPills
        pills={buildPills(status, carFilter, counts.carEnquiriesOpen)}
        label="Filter car enquiries by status"
      />

      {carFilter ? (
        <p className="tm-up flex flex-wrap items-center gap-2 text-[13px] leading-[1.45] font-medium text-tm-text-2 [animation-duration:0.5s]">
          Showing one car only
          {filteredCar ? <span className="font-semibold text-tm-ink">{filteredCar.title}</span> : null}
          <Link
            href={status === "all" ? "/admin/cars/enquiries?status=all" : "/admin/cars/enquiries"}
            className="font-semibold text-tm-coral-strong underline underline-offset-2"
          >
            Show every car
          </Link>
        </p>
      ) : null}

      <AdminCard
        index={0}
        title={status === "all" ? "Every enquiry" : `${labelFor(status)} enquiries`}
        blurb="Newest first. Accepting an offer records that a human said yes so the buyer can pick the conversation up. It is not a sale and takes no payment."
      >
        {rows.length === 0 ? (
          <AdminEmpty title={emptyTitle(status)} body={emptyBody(status)} />
        ) : (
          <EnquiryQueue rows={rows} />
        )}
      </AdminCard>

      {total > rows.length ? (
        <p className="text-[12px] leading-[1.4] font-medium text-tm-text-3">
          Showing the newest <span className="tm-nums">{rows.length}</span> of{" "}
          <span className="tm-nums">{total}</span>.
        </p>
      ) : null}
    </AdminPage>
  );
}

// ── Making a row readable ───────────────────────────────────────────────────

interface ProfileLookupRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

interface ListingLookupRow {
  id: string;
  slug: string;
  make: string;
  model: string;
  trim: string | null;
  year: number;
  price_state: string;
  price_pesewas: number | null;
  is_published: boolean;
}

/**
 * The car and the customer behind each enquiry, in two queries rather than two
 * per row.
 *
 * THE EMAIL COMES FROM `auth.users`, not from `profiles` — the profile has a
 * name and no address (migration 001), and an admin answering "what does this
 * cost" needs a way to reach the person if the conversation leaves the queue.
 * One `getUserById` per DISTINCT customer, which is what `admin-bags.ts` does
 * for the same reason; the page is capped at {@link PAGE_SIZE} rows, so the fan
 * out is bounded.
 *
 * A LOOKUP THAT FAILS DOES NOT FAIL THE QUEUE. A name is an addition to a row
 * that is already actionable — the message, the amount and the car are on the
 * enquiry itself — and losing the whole screen because the auth service hiccuped
 * would be the worse outcome.
 */
async function resolve(
  enquiries: Awaited<ReturnType<typeof listCarEnquiriesForAdmin>>["enquiries"],
): Promise<AdminCarEnquiry[]> {
  if (enquiries.length === 0) return [];

  const db = createAdminClient();
  const listingIds = [...new Set(enquiries.map((row) => row.car_listing_id))];
  const userIds = [...new Set(enquiries.map((row) => row.user_id))];

  const [listings, profiles, emails] = await Promise.all([
    (async (): Promise<ListingLookupRow[]> => {
      const { data, error } = await db
        .from("car_listings")
        .select("id, slug, make, model, trim, year, price_state, price_pesewas, is_published")
        .in("id", listingIds);
      return error ? [] : ((data ?? []) as unknown as ListingLookupRow[]);
    })(),
    (async (): Promise<ProfileLookupRow[]> => {
      const { data, error } = await db
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", userIds);
      return error ? [] : ((data ?? []) as unknown as ProfileLookupRow[]);
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

  const listingById = new Map(listings.map((row) => [row.id, row]));
  const profileById = new Map(profiles.map((row) => [row.id, row]));
  const emailById = new Map(emails);

  return enquiries.map((enquiry) => {
    const listing = listingById.get(enquiry.car_listing_id) ?? null;
    const profile = profileById.get(enquiry.user_id) ?? null;
    const name = [profile?.first_name, profile?.last_name]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(" ");

    return {
      enquiry,
      car: listing
        ? {
            id: listing.id,
            slug: listing.slug,
            title: carTitle(listing),
            priceState: listing.price_state,
            pricePesewas: listing.price_pesewas,
            isPublished: listing.is_published,
          }
        : null,
      customer: {
        id: enquiry.user_id,
        // Never a raw uuid on screen. A customer with no name on their profile
        // is ordinary — the signup trigger only copies one when the form sent
        // one — so the email is the fallback, and the id is the last resort.
        name: name.length > 0 ? name : null,
        email: emailById.get(enquiry.user_id) ?? null,
      },
    };
  });
}

// ── The filter ──────────────────────────────────────────────────────────────

function buildPills(
  status: CarEnquiryStatus | "all",
  car: string | undefined,
  open: number,
): AdminFilterPill[] {
  const carry = car ? `&car=${encodeURIComponent(car)}` : "";
  const base = car ? `/admin/cars/enquiries?car=${encodeURIComponent(car)}` : "/admin/cars/enquiries";

  return [
    // Only "Waiting" carries a number, and only when there is one: it is the
    // figure the sidebar badge shows and the only one an admin acts on.
    { label: "Waiting", href: base, active: status === CAR_ENQUIRY_STATUSES.OPEN, count: open },
    {
      label: "Answered",
      href: `/admin/cars/enquiries?status=answered${carry}`,
      active: status === CAR_ENQUIRY_STATUSES.ANSWERED,
    },
    {
      label: "Accepted",
      href: `/admin/cars/enquiries?status=accepted${carry}`,
      active: status === CAR_ENQUIRY_STATUSES.ACCEPTED,
    },
    {
      label: "Declined",
      href: `/admin/cars/enquiries?status=declined${carry}`,
      active: status === CAR_ENQUIRY_STATUSES.DECLINED,
    },
    {
      label: "All",
      href: `/admin/cars/enquiries?status=all${carry}`,
      active: status === "all",
    },
  ];
}

function labelFor(status: CarEnquiryStatus): string {
  switch (status) {
    case CAR_ENQUIRY_STATUSES.OPEN:
      return "Waiting";
    case CAR_ENQUIRY_STATUSES.ANSWERED:
      return "Answered";
    case CAR_ENQUIRY_STATUSES.ACCEPTED:
      return "Accepted";
    case CAR_ENQUIRY_STATUSES.DECLINED:
      return "Declined";
    default:
      return "Withdrawn";
  }
}

function emptyTitle(status: CarEnquiryStatus | "all"): string {
  if (status === CAR_ENQUIRY_STATUSES.OPEN) return "Nobody is waiting";
  if (status === "all") return "No enquiries yet";
  return `Nothing ${labelFor(status).toLowerCase()}`;
}

function emptyBody(status: CarEnquiryStatus | "all"): string {
  if (status === CAR_ENQUIRY_STATUSES.OPEN) {
    return "Every enquiry has been answered. A new one lands here when a customer asks what a price-on-request car costs, or offers a figure for a negotiable one.";
  }
  return "Only cars listed as price-on-request or open to offers can be enquired about — a fixed price is not a negotiation, so there is nothing to ask.";
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
