"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EyeIcon, EyeOffIcon, Trash2Icon } from "lucide-react";

import { AdminBadge, AdminButton, AdminCard, AdminConfirm } from "@/components/layout/admin";
import { CAR_PRICE_STATES } from "@/config/constants";
import { carTitle, priceLabel } from "@/features/cars/format";
import type { CarListingView } from "@/features/cars/types";
import { apiFetch } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import type { ApiSuccessResponse } from "@/types/api";

/**
 * Putting a car on the site, and taking it off again (migration 067).
 *
 * WHY THIS IS NOT A CHECKBOX IN THE FORM. Unpublishing is how a SOLD or
 * MISPRICED car stops being advertised, and it is the most consequential control
 * on the whole feature: the listing leaves the storefront, and — because
 * `/api/cars/photos/[photoId]` re-checks `is_published` on every single request
 * — its photographs stop being served in the same instant, to everyone, even to
 * somebody holding a direct link to the image. A control that does that deserves
 * a sentence about what will happen, not a tick box in a sub-bar. It is also a
 * separate verb on the API (`PATCH`) for a reason the route states: routing a
 * toggle through the full replacement would let it rewrite twenty other columns
 * with whatever the form last had in memory.
 *
 * PUBLISHING IS GUARDED ON A PHOTOGRAPH, by `setCarPublished`, and the guard is
 * explained here rather than being met as a 422. A car page with a grey box
 * where the picture goes is not a listing — the whole proposition is looking at
 * the car.
 *
 * THE ADDRESS IS A LINK ONLY WHILE THE CAR IS PUBLISHED, and printed as plain
 * text otherwise. `/app/cars/[slug]` renders published listings only, so a
 * draft's address 404s by design — and an admin control that opens the
 * not-found screen is the exact bug that took the Cars entry out of the sidebar
 * in the first place. Verified against the running app: a published slug
 * answers 200 to a signed-out caller and a draft's answers 404.
 */
export function CarPublishPanel({
  car,
  photoCount,
  index = 0,
}: {
  car: CarListingView;
  photoCount: number;
  index?: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<"unpublish" | "delete" | null>(null);
  const [, startTransition] = useTransition();

  const title = carTitle(car);
  const price = priceLabel(car);
  const canPublish = photoCount > 0;

  async function setPublished(next: boolean) {
    setBusy(true);
    try {
      await apiFetch<ApiSuccessResponse<CarListingView>>(`/api/admin/cars/${car.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_published: next }),
      });
      setConfirming(null);
      toast.success({
        title: next ? "Published" : "Taken off the site",
        description: next
          ? `${title} is on the site now, with its photographs.`
          : "The listing and its photographs are no longer served to anyone.",
      });
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error({
        title: next ? "Could not publish this car" : "Could not take it off the site",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await apiFetch(`/api/admin/cars/${car.id}`, { method: "DELETE" });
      toast.success({
        title: "Listing deleted",
        description: "The row, its photographs and their files are gone.",
      });
      router.push("/admin/cars");
      router.refresh();
    } catch (error) {
      toast.error({
        title: "Could not delete the listing",
        description: error instanceof Error ? error.message : "Please try again.",
      });
      setBusy(false);
    }
  }

  return (
    <>
      <AdminCard
        index={index}
        title={car.is_published ? "On the site" : "Not on the site"}
        action={
          <AdminBadge tone={car.is_published ? "green" : "muted"}>
            {car.is_published ? "Published" : "Draft"}
          </AdminBadge>
        }
      >
        <div className="flex min-w-0 flex-col gap-4">
          <p className="max-w-[72ch] text-[13px] leading-[1.55] font-medium text-tm-text-2">
            {car.is_published ? (
              <>
                <span className="font-semibold text-tm-ink">
                  Anyone can see this car and its photographs.
                </span>{" "}
                It is advertised at {price.isAmount ? price.text : "no price"}
                {car.price_state === CAR_PRICE_STATES.NEGOTIABLE
                  ? ", and customers can make an offer against it."
                  : car.price_state === CAR_PRICE_STATES.ON_REQUEST
                    ? ", and customers can ask what it costs."
                    : ", which is not open to negotiation."}
              </>
            ) : (
              <>
                <span className="font-semibold text-tm-ink">Nobody outside the admin can see it.</span>{" "}
                The photographs below are served to you and to no one else, so you can look at
                the listing before the rest of the world does.
              </>
            )}
          </p>

          <p className="tm-nums text-[12.5px] leading-[1.45] font-medium text-tm-text-3">
            Its address on the site is{" "}
            {car.is_published ? (
              <Link
                href={`/app/cars/${car.slug}`}
                className="font-semibold text-tm-coral-strong underline underline-offset-2"
              >
                /app/cars/{car.slug}
              </Link>
            ) : (
              <>/app/cars/{car.slug} — which is a 404 until you publish it</>
            )}
          </p>

          {!car.is_published && !canPublish ? (
            <p className="max-w-[72ch] rounded-[14px] bg-tm-pill-bg px-4 py-3 text-[13px] leading-[1.5] font-semibold text-tm-coral-strong">
              Add at least one photograph before publishing. A car listing with no picture is
              not a listing.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {car.is_published ? (
              <AdminButton
                variant="danger"
                busy={busy}
                onClick={() => setConfirming("unpublish")}
              >
                <EyeOffIcon className="size-3.5" aria-hidden />
                Take it off the site
              </AdminButton>
            ) : (
              <AdminButton
                variant="primary"
                busy={busy}
                disabled={!canPublish}
                onClick={() => setPublished(true)}
              >
                <EyeIcon className="size-3.5" aria-hidden />
                Publish this car
              </AdminButton>
            )}

            <AdminButton variant="quiet" disabled={busy} onClick={() => setConfirming("delete")}>
              <Trash2Icon className="size-3.5" aria-hidden />
              Delete the listing
            </AdminButton>
          </div>
        </div>
      </AdminCard>

      <AdminConfirm
        open={confirming === "unpublish"}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
        title={`Take ${title} off the site?`}
        consequence="The listing disappears from the storefront and its photographs stop being served in the same instant — the photo route re-checks this on every request, so even a direct link to a picture stops working. Enquiries already made stay where they are."
        detail="This is the right thing to do for a car that has sold or is mispriced. Publishing it again puts it straight back."
        confirmLabel="Take it off"
        busy={busy}
        onConfirm={() => setPublished(false)}
      />

      <AdminConfirm
        open={confirming === "delete"}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
        title={`Delete ${title}?`}
        consequence="The listing, its photographs and the files behind them are removed permanently. This cannot be undone; only the audit log will remember the car existed."
        detail={
          car.is_published
            ? "This car is live right now. If it has simply sold, take it off the site instead — that is reversible, and this is not."
            : undefined
        }
        confirmLabel="Delete it"
        busy={busy}
        onConfirm={remove}
      />
    </>
  );
}
