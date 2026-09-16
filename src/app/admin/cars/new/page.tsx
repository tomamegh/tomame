import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { AdminPage } from "@/components/layout/admin";

import { CarForm } from "../car-form";

export const metadata: Metadata = {
  title: "New car · Tomame admin",
};

/**
 * `/admin/cars/new` — write a car up (migration 067).
 *
 * A server component holding a client form, rather than a `"use client"` page:
 * the frame, the title and the metadata have no state and should not ship.
 *
 * IT ALWAYS CREATES A DRAFT. `createCar` writes whatever `is_published` it is
 * given, and unlike `setCarPublished` it does NOT check that the listing has a
 * photograph first — so a create form offering a publish switch could put a car
 * on the storefront with a grey box where the picture goes, which is the one
 * thing a car listing may not be. Publishing is an explicit action on the
 * listing screen, once there is something to look at.
 */
export default function NewCarPage() {
  return (
    <AdminPage
      title="New car"
      blurb="Saved as a draft. Add the photographs on the next screen, then publish it. A listing with no picture cannot go on the site."
      action={
        <Link
          href="/admin/cars"
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-tm-border bg-card px-4 text-[13px] font-semibold text-tm-text-2 transition-colors hover:bg-tm-paper"
        >
          <ArrowLeftIcon className="size-4" aria-hidden />
          Back to cars
        </Link>
      }
    >
      <CarForm mode={{ kind: "create" }} />
    </AdminPage>
  );
}
