import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, MessagesSquareIcon } from "lucide-react";

import { AdminBadge, AdminPage } from "@/components/layout/admin";
import { carTitle, priceLabel } from "@/features/cars/format";
import { carIdSchema } from "@/features/cars/schema";
import {
  getCarForAdmin,
  listCarEnquiriesForAdmin,
} from "@/features/cars/services/cars.service";

import { CarForm } from "../car-form";
import { CarPhotoManager } from "./car-photo-manager";
import { CarPublishPanel } from "./car-publish-panel";

export const metadata: Metadata = {
  title: "Car listing · Tomame admin",
};

/**
 * `/admin/cars/[id]` — one vehicle (migration 067).
 *
 * A server component holding three client islands, split by what each of them
 * actually does rather than by what is near what on the screen:
 *
 *   `CarPublishPanel` — the consequential verb. Publishing and unpublishing is a
 *     separate PATCH, so that it cannot rewrite the rest of the row, and so that
 *     it can carry a stated consequence instead of being a checkbox in a form.
 *   `CarPhotoManager` — the gallery, which changes while an admin is standing in
 *     front of it with a phone.
 *   `CarForm` — the twenty columns, saved as one full replacement.
 *
 * The read goes through `getCarForAdmin`, which is the admin-side read that does
 * NOT filter on `is_published` — a draft is the normal case here and must
 * resolve. A malformed id is a 404 rather than a 500, the same answer
 * `/api/admin/cars/[id]` gives: "that is not a listing" is true either way.
 *
 * `src/proxy.ts` gates the whole `/admin` prefix; there is deliberately no
 * second check here (see `admin/layout.tsx`).
 */
export default async function AdminCarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = carIdSchema.safeParse(id);
  if (!parsed.success) notFound();

  const found = await getCarForAdmin(parsed.data);
  if (!found) notFound();

  const { car, photos } = found;
  const price = priceLabel(car);

  // Only this car's conversations, so an admin looking at a vehicle can see
  // whether anybody is waiting on it. Answering happens on the queue, which is
  // where the guarded transition lives — a second set of buttons here would be a
  // second place for two admins to race each other.
  const { enquiries } = await listCarEnquiriesForAdmin({
    carListingId: car.id,
    status: "open",
    limit: 20,
  });

  return (
    <AdminPage
      title={carTitle(car)}
      blurb={
        car.description.trim().length > 0
          ? car.description.trim().slice(0, 180)
          : "No description written yet. It is the part of the page that says what the photographs cannot."
      }
      action={
        <>
          {enquiries.length > 0 ? (
            <Link
              href={`/admin/cars/enquiries?car=${car.id}`}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-tm-border bg-card px-4 text-[13px] font-semibold text-tm-coral-strong transition-colors hover:bg-tm-pill-bg"
            >
              <MessagesSquareIcon className="size-4" aria-hidden />
              {enquiries.length === 1
                ? "1 enquiry waiting"
                : `${enquiries.length} enquiries waiting`}
            </Link>
          ) : null}
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
      <div className="tm-up flex flex-wrap items-center gap-2 [animation-duration:0.5s]">
        <AdminBadge tone={car.is_published ? "green" : "muted"}>
          {car.is_published ? "Published" : "Draft"}
        </AdminBadge>
        <AdminBadge tone={price.isAmount ? "neutral" : "muted"}>{price.text}</AdminBadge>
        <AdminBadge tone={photos.length > 0 ? "neutral" : "coral"}>
          {photos.length === 0
            ? "No photographs"
            : `${photos.length} ${photos.length === 1 ? "photograph" : "photographs"}`}
        </AdminBadge>
      </div>

      <CarPublishPanel car={car} photoCount={photos.length} index={0} />

      <CarPhotoManager
        carListingId={car.id}
        initialPhotos={photos}
        isPublished={car.is_published}
        index={1}
      />

      <CarForm mode={{ kind: "edit", car }} />
    </AdminPage>
  );
}
