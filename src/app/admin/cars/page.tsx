import type { Metadata } from "next";
import Link from "next/link";
import { MessagesSquareIcon, PlusIcon } from "lucide-react";

import {
  AdminCard,
  AdminEmpty,
  AdminFilterPills,
  AdminPage,
  AdminSearchForm,
  AdminStat,
  type AdminFilterPill,
} from "@/components/layout/admin";
import { getAdminQueueCounts } from "@/db/queries/admin-queues";
import { carTitle } from "@/features/cars/format";
import { listCarsForAdmin } from "@/features/cars/services/cars.service";
import {
  toCarPhotoView,
  type CarListingView,
  type CarPhotoRow,
  type CarPhotoView,
} from "@/features/cars/types";
import { createAdminClient } from "@/lib/supabase/admin";

import { CarsList, type AdminCarRow } from "./cars-list";

export const metadata: Metadata = {
  title: "Cars · Tomame admin",
  description: "The vehicles on the water, and the ones still being written up.",
};

/**
 * `/admin/cars` — every car Tomame has written up (migration 067).
 *
 * A server component. The list is READ rather than worked: each row is a link to
 * the listing screen, the filter and the search term live in the URL, and there
 * is no state to hold — so nothing here ships to the browser. That is the same
 * split `/admin/policies` uses, and the reason the enquiry queue next door is
 * the opposite shape.
 *
 * WHY THE SERVICE FOR THE LISTINGS AND A DIRECT READ FOR THE COVERS. The
 * listings come through `listCarsForAdmin`, which is the one place the row/view
 * boundary is applied. The covers cannot: `listCarPhotosForAdmin` is per
 * listing, and calling it once per row would be fifty round trips to draw one
 * column. So the covers are read in a single `IN` query here — the same
 * service-role read `/admin/policies` does of its own table — and mapped with
 * `toCarPhotoView`, so the URL a browser sees is still built in exactly one
 * place and `storage_path` still never leaves the server. Nothing on this page
 * crosses to a client component, so the row never travels.
 *
 * `src/proxy.ts` has already established that the caller is an admin before this
 * renders; there is deliberately no second check here (see `admin/layout.tsx`).
 */

const PAGE_SIZE = 50;

export default async function AdminCarsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filter = readFilter(single(params.published));
  const search = single(params.q)?.trim() || undefined;

  const [page, publishedOnly, draftsOnly, counts] = await Promise.all([
    listCarsForAdmin({
      publishedOnly: filter === "all" ? undefined : filter === "published",
      search,
      limit: PAGE_SIZE,
    }),
    // Count-only reads, so the pills and the tiles carry real figures rather
    // than the figures of whatever filter happens to be applied.
    listCarsForAdmin({ publishedOnly: true, limit: 1 }),
    listCarsForAdmin({ publishedOnly: false, limit: 1 }),
    getAdminQueueCounts(),
  ]);

  const rows = await withCovers(page.cars);
  const today = new Date().toISOString().slice(0, 10);
  const unpublishable = rows.filter((row) => row.photoCount === 0).length;

  return (
    <AdminPage
      title="Cars"
      blurb="Vehicles we have bought, or are about to. Each one is written by hand — there is no page to extract and no formula to run — and nothing reaches the site until it has a photograph and you publish it."
      action={
        <>
          <Link
            href="/admin/cars/enquiries"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-tm-border bg-card px-4 text-[13px] font-semibold text-tm-text-2 transition-colors hover:bg-tm-paper"
          >
            <MessagesSquareIcon className="size-4" aria-hidden />
            Enquiries
            {counts.carEnquiriesOpen > 0 ? (
              <span className="tm-nums rounded-full bg-tm-pill-bg px-1.5 py-0.5 text-[11px] leading-none font-bold text-tm-coral-strong">
                {counts.carEnquiriesOpen}
              </span>
            ) : null}
          </Link>
          <Link
            href="/admin/cars/new"
            className="tm-cta-gradient inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            <PlusIcon className="size-4" aria-hidden />
            New car
          </Link>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <AdminStat
          index={0}
          label="On the site"
          value={`${publishedOnly.total}`}
          detail={`of ${publishedOnly.total + draftsOnly.total} written up`}
          tone={publishedOnly.total > 0 ? "green" : "muted"}
        />
        <AdminStat
          index={1}
          label="Still drafts"
          value={`${draftsOnly.total}`}
          detail={
            draftsOnly.total === 0
              ? "Nothing waiting to go out"
              : "Written, not yet on the site"
          }
          tone={draftsOnly.total > 0 ? "amber" : "muted"}
        />
        <AdminStat
          index={2}
          label="Enquiries waiting"
          value={`${counts.carEnquiriesOpen}`}
          detail={
            counts.carEnquiriesOpen === 0
              ? "Nobody is waiting on a price"
              : "Each one is a customer waiting to be told a price"
          }
          tone={counts.carEnquiriesOpen > 0 ? "coral" : "green"}
          href="/admin/cars/enquiries"
        />
      </div>

      {unpublishable > 0 ? (
        <AdminCard
          index={1}
          title={
            unpublishable === 1
              ? "One listing has no photograph"
              : `${unpublishable} listings have no photograph`
          }
          blurb="Publishing is refused until a listing has at least one picture. A car page with a grey box on it is not a listing — the whole proposition is looking at the car."
        >
          <ul className="flex flex-wrap gap-2">
            {rows
              .filter((row) => row.photoCount === 0)
              .map((row) => (
                <li key={row.car.id}>
                  <Link
                    href={`/admin/cars/${row.car.id}`}
                    className="inline-flex items-center rounded-full bg-tm-pill-bg px-3 py-1.5 text-[12.5px] leading-none font-semibold text-tm-coral-strong transition-opacity hover:opacity-80"
                  >
                    {carTitle(row.car)}
                  </Link>
                </li>
              ))}
          </ul>
        </AdminCard>
      ) : null}

      {/*
        The filter and the search are a row of their OWN, above the card, rather
        than in its `action` slot — which `/admin/orders` also does, and for a
        reason that only shows up on a phone: the kit wraps `action` in a
        `shrink-0` flex item, so a wrapping group inside it is sized by its
        max-content width and runs straight off the right edge of a 390px screen
        instead of wrapping. Here they get the full width and wrap freely.
      */}
      <div className="tm-up flex flex-wrap items-center justify-between gap-3 [animation-duration:0.5s]">
        <AdminFilterPills
          pills={buildPills(filter, search, publishedOnly.total, draftsOnly.total)}
          label="Filter cars by whether they are on the site"
        />
        <AdminSearchForm
          action="/admin/cars"
          placeholder="Make, model or trim"
          label="Search the cars by make, model or trim"
          defaultValue={search}
          hidden={{ published: filter === "all" ? undefined : String(filter === "published") }}
        />
      </div>

      <AdminCard
        index={2}
        title="All cars"
        blurb="Lowest sort order first, newest next — the same order the storefront uses."
        flush={rows.length > 0}
      >
        {rows.length === 0 ? (
          <AdminEmpty
            title={search ? `Nothing matches “${search}”` : emptyTitle(filter)}
            body={
              search
                ? "The search looks at the make, model and trim only. Clear it to see everything."
                : emptyBody(filter)
            }
          >
            {search || filter !== "all" ? (
              <Link
                href="/admin/cars"
                className="mt-1 inline-flex h-9 items-center rounded-full border border-tm-border bg-card px-4 text-[13px] font-semibold text-tm-text-2 transition-colors hover:bg-tm-paper"
              >
                Show every car
              </Link>
            ) : (
              <Link
                href="/admin/cars/new"
                className="tm-cta-gradient mt-1 inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
              >
                <PlusIcon className="size-4" aria-hidden />
                Write the first one up
              </Link>
            )}
          </AdminEmpty>
        ) : (
          <CarsList rows={rows} today={today} />
        )}
      </AdminCard>

      {page.total > rows.length ? (
        <p className="text-[12px] leading-[1.4] font-medium text-tm-text-3">
          Showing the first <span className="tm-nums">{rows.length}</span> of{" "}
          <span className="tm-nums">{page.total}</span>. Narrow it with the search box.
        </p>
      ) : null}
    </AdminPage>
  );
}

// ── Covers ──────────────────────────────────────────────────────────────────

/**
 * One query for every listing's photographs, rather than one query per listing.
 *
 * The full row is selected so `toCarPhotoView` can map it — that mapper is the
 * only place `/api/cars/photos/<id>` is spelled, and the only place the
 * `storage_path` is dropped. This runs on the server and the result never
 * reaches a client component, so the key does not travel even for the moment it
 * is in memory.
 *
 * WHICH PHOTO IS THE COVER. `is_cover` when there is one, and the first by sort
 * order when there is not — the same fallback the storefront makes, so the two
 * screens cannot disagree about which picture represents a car.
 */
async function withCovers(cars: readonly CarListingView[]): Promise<AdminCarRow[]> {
  if (cars.length === 0) return [];

  const { data, error } = await createAdminClient()
    .from("car_photos")
    .select(
      "id, car_listing_id, storage_path, content_type, width, height, byte_size, alt_text, sort_order, is_cover, uploaded_by, created_at",
    )
    .in(
      "car_listing_id",
      cars.map((car) => car.id),
    )
    .order("sort_order", { ascending: true });

  // A gallery is an addition to a row that has already resolved. Losing the
  // covers must not lose the list — the same call `photosFor` makes in the
  // service, and for the same reason.
  const photos = error ? [] : ((data ?? []) as unknown as CarPhotoRow[]);

  const byListing = new Map<string, CarPhotoRow[]>();
  for (const photo of photos) {
    const bucket = byListing.get(photo.car_listing_id);
    if (bucket) bucket.push(photo);
    else byListing.set(photo.car_listing_id, [photo]);
  }

  return cars.map((car) => {
    const own = byListing.get(car.id) ?? [];
    const coverRow = own.find((photo) => photo.is_cover) ?? own[0] ?? null;
    const cover: CarPhotoView | null = coverRow
      ? toCarPhotoView(coverRow, carTitle(car))
      : null;
    return { car, cover, photoCount: own.length };
  });
}

// ── The filter ──────────────────────────────────────────────────────────────

type CarFilter = "all" | "published" | "draft";

/**
 * Anything unrecognised means "everything", which is what the API route does
 * with it too — a stale bookmark shows the whole list rather than an error.
 */
function readFilter(raw: string | undefined): CarFilter {
  if (raw === "true") return "published";
  if (raw === "false") return "draft";
  return "all";
}

function buildPills(
  filter: CarFilter,
  search: string | undefined,
  published: number,
  drafts: number,
): AdminFilterPill[] {
  const carry = search ? `&q=${encodeURIComponent(search)}` : "";
  return [
    {
      label: "All",
      href: `/admin/cars${search ? `?q=${encodeURIComponent(search)}` : ""}`,
      active: filter === "all",
    },
    {
      label: "On the site",
      href: `/admin/cars?published=true${carry}`,
      active: filter === "published",
      count: published,
    },
    {
      label: "Drafts",
      href: `/admin/cars?published=false${carry}`,
      active: filter === "draft",
      count: drafts,
    },
  ];
}

function emptyTitle(filter: CarFilter): string {
  if (filter === "published") return "No car is on the site yet";
  if (filter === "draft") return "Nothing is waiting in drafts";
  return "No cars written up yet";
}

function emptyBody(filter: CarFilter): string {
  if (filter === "published") {
    return "Everything written up so far is still a draft. A listing needs at least one photograph before it can be published.";
  }
  if (filter === "draft") {
    return "Every listing is on the site. A new car starts here as a draft, so this is where a half-written one would be.";
  }
  return "A car listing is written by hand rather than extracted from a store page: the make and model, the odometer, which ship it is on, and what kind of price it carries.";
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
