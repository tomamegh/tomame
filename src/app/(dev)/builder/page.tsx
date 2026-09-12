import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { isBuilderEnabled } from "@/config/builder";
import {
  MARKETING_IMAGES,
  applyImageOverride,
  imagePosition,
  type MarketingImageKey,
} from "@/config/marketing-images";
import { getMediaOverrides } from "@/db/queries/media-overrides";
import { getAuthenticatedUser } from "@/features/auth/services/auth.service";

import { SlotCard, type BuilderSlot } from "./_components/slot-card";
import { framesForKey } from "./_lib/slot-frames";

/**
 * /builder — replace and re-crop the marketing photography on a running
 * environment.
 *
 * The screen is gated twice, exactly as the API is: the deployment switch, then
 * the admin role. Both failures render a 404 rather than a sign-in prompt or a
 * 403, so the route never admits it exists to anyone who should not be here.
 * This is a convenience, not the security boundary — every write is
 * re-authorised inside the route handler, which is the only check that counts.
 */

/**
 * Metadata is resolved independently of the page body, so a static title would
 * survive the notFound() below and put "Builder" in the tab of the 404 a
 * non-admin sees — advertising the route to exactly the person it is hidden
 * from. Gating it the same way keeps the 404 indistinguishable from any other.
 */
export async function generateMetadata(): Promise<Metadata> {
  const hidden: Metadata = { robots: { index: false, follow: false } };
  if (!isBuilderEnabled()) return hidden;

  const user = await getAuthenticatedUser();
  if (user?.profile.role !== "admin") return hidden;

  return { ...hidden, title: "Builder · Tomame" };
}

/** Overrides change out of band; a cached shell would show a stale crop. */
export const dynamic = "force-dynamic";

const KEYS = Object.keys(MARKETING_IMAGES) as MarketingImageKey[];

export default async function BuilderPage() {
  if (!isBuilderEnabled()) notFound();

  const user = await getAuthenticatedUser();
  if (!user || user.profile.role !== "admin") notFound();

  const overrides = await getMediaOverrides();

  const slots: BuilderSlot[] = KEYS.map((key) => {
    const manifest = MARKETING_IMAGES[key];
    const override = overrides[key];
    // The same resolver the marketing pages use, so the preview cannot drift
    // from what a visitor is served — including the storage-path cache buster.
    const resolved = applyImageOverride(manifest, override, key);

    return {
      key,
      shot: manifest.shot,
      src: resolved.src,
      width: resolved.width,
      height: resolved.height,
      position: imagePosition(resolved),
      alt: resolved.alt,
      uploaded: Boolean(override?.storage_path),
      overridden: Boolean(override),
      frames: framesForKey(key),
    };
  });

  const uploadedCount = slots.filter((slot) => slot.uploaded).length;
  const croppedCount = slots.filter(
    (slot) => slot.overridden && !slot.uploaded,
  ).length;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8 md:py-14">
      <header className="flex flex-col gap-3 pb-8">
        <h1 className="text-3xl font-bold tracking-[-0.02em] md:text-4xl">
          Photo builder
        </h1>
        <p className="max-w-2xl text-sm text-tm-text-2">
          Every marketing photo on the site. Replace one with a file from this
          machine, drag it until the subject sits where you want it inside the
          box the real page uses, then save. Changes take effect immediately on
          the live pages — there is no deploy step and no draft state.
        </p>
        <p className="text-xs text-tm-text-3">
          {slots.length} slots · {uploadedCount} replaced · {croppedCount}{" "}
          re-cropped
        </p>
      </header>

      <div className="flex flex-col gap-5">
        {slots.map((slot) => (
          <SlotCard
            // Remounting on a changed image or crop is deliberate: after an
            // upload or a reset the server is the truth, and stale local edit
            // state would quietly overwrite it on the next save.
            key={`${slot.key}:${slot.src}:${slot.position}`}
            slot={slot}
          />
        ))}
      </div>
    </main>
  );
}
