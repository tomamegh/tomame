import Link from "next/link";

import { AdminBadge } from "@/components/layout/admin";
import { MARKETING_IMAGES } from "@/config/marketing-images";
import { marketingPagesWithSlots } from "@/config/marketing-pages";
import type { AdminMediaOverrideRow } from "@/db/queries/admin-content";
import { formatJoined } from "@/features/users/components/admin-user-format";

/**
 * The Content screen's way into the photo builder.
 *
 * WHAT THIS REPLACED. This tab used to be a read-only table of
 * `media_overrides` rows whose own caption told the reader that changes are
 * made somewhere else. An admin who wanted to fix a photo learned the name of
 * the slot and then had to know, from nowhere on the screen, that `/builder`
 * exists. So the page is the unit now: one row per marketing page, how many of
 * its photos have been changed, and the link that opens the builder on exactly
 * those photos. The override rows are still here, folded away under each page,
 * because "what did we change and when" is a real question — it is just not the
 * first one.
 *
 * Server component: it renders links and folded detail, so it needs no
 * JavaScript, and the Content screen stays a screen that ships none of its own.
 */

export interface AdminBuilderPanelProps {
  overrides: AdminMediaOverrideRow[];
  /**
   * `isBuilderEnabled()` from the server. When the deployment switch is off the
   * builder answers 404, so the link is withheld rather than offered and broken.
   */
  builderEnabled: boolean;
}

type SlotState = "replaced" | "recropped" | "default";

function slotState(override: AdminMediaOverrideRow | undefined): SlotState {
  if (!override) return "default";
  // A stored upload or a pointed-at source is a different photo; a position or
  // alt on its own is the same photo, framed or described differently.
  if (override.storage_path || override.src) return "replaced";
  return "recropped";
}

const STATE_LABEL: Record<SlotState, string> = {
  replaced: "Replaced",
  recropped: "Re-cropped",
  default: "Manifest default",
};

export function AdminBuilderPanel({ overrides, builderEnabled }: AdminBuilderPanelProps) {
  const byKey = new Map(overrides.map((row) => [row.key, row]));
  const pages = marketingPagesWithSlots();

  // A row whose key is no longer in the manifest belongs to no page, so the
  // list above cannot show it. It would otherwise vanish from the admin while
  // still sitting in the table, so it is named here instead.
  const filed = new Set(pages.flatMap((page) => page.keys as readonly string[]));
  const orphans = overrides.filter((row) => !filed.has(row.key));

  return (
    <div className="flex flex-col">
      {!builderEnabled ? (
        <p className="border-b border-tm-hairline bg-tm-amber-bg px-5 py-3 text-[13px] leading-[1.5] font-medium text-[#7a4a06]">
          The builder is switched off on this deployment, so it answers 404 and
          the links below are withheld. Set BUILDER_ENABLED to true on the
          environment to turn it on.
        </p>
      ) : null}

      <ul className="flex flex-col">
        {pages.map((page) => {
          const changed = page.keys.filter((key) => byKey.has(key));
          const replaced = changed.filter(
            (key) => slotState(byKey.get(key)) === "replaced",
          ).length;

          return (
            <li
              key={page.slug}
              className="border-b border-tm-hairline last:border-b-0"
            >
              <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-col gap-1">
                  <h3 className="font-display text-[15px] leading-none font-bold text-tm-ink">
                    {page.label}
                  </h3>
                  <p className="tm-nums text-[12px] leading-[1.4] font-medium text-tm-text-3">
                    {page.route} · {page.keys.length}{" "}
                    {page.keys.length === 1 ? "photo" : "photos"}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <AdminBadge tone={changed.length > 0 ? "coral" : "muted"}>
                    {changed.length === 0
                      ? "All manifest defaults"
                      : `${changed.length} of ${page.keys.length} changed`}
                  </AdminBadge>
                  {replaced > 0 ? (
                    <AdminBadge tone="neutral">
                      {replaced} {replaced === 1 ? "photo" : "photos"} replaced
                    </AdminBadge>
                  ) : null}
                  {builderEnabled ? (
                    <Link
                      href={`/builder?page=${page.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="tm-cta-gradient inline-flex h-9 items-center justify-center rounded-full px-4 text-[13px] leading-none font-semibold whitespace-nowrap text-white shadow-[0_10px_24px_-14px_rgba(244,63,94,0.65)] transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-tm-coral/40 focus-visible:outline-none"
                    >
                      Open builder
                      <span className="sr-only"> for {page.label}, in a new tab</span>
                    </Link>
                  ) : null}
                </div>
              </div>

              <details className="group px-5 pb-4">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full text-[12px] leading-none font-semibold text-tm-text-2 hover:text-tm-ink focus-visible:ring-2 focus-visible:ring-tm-coral/40 focus-visible:outline-none">
                  <span aria-hidden="true" className="transition-transform group-open:rotate-90">
                    ›
                  </span>
                  What each photo is doing now
                </summary>

                <ul className="mt-3 flex flex-col gap-2.5">
                  {page.keys.map((key) => {
                    const override = byKey.get(key);
                    const state = slotState(override);

                    return (
                      <li
                        key={key}
                        className="flex flex-col gap-1.5 rounded-[14px] bg-tm-paper px-3.5 py-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="tm-nums text-[12px] leading-none font-bold text-tm-ink">
                            {key}
                          </span>
                          <AdminBadge
                            tone={
                              state === "replaced"
                                ? "coral"
                                : state === "recropped"
                                  ? "amber"
                                  : "muted"
                            }
                          >
                            {STATE_LABEL[state]}
                          </AdminBadge>
                          {override ? (
                            <span className="tm-nums text-[12px] leading-none font-medium text-tm-text-3">
                              changed {formatJoined(override.updated_at) ?? "at an unknown time"}
                            </span>
                          ) : null}
                        </div>

                        <p className="text-[12px] leading-[1.45] font-medium text-tm-text-2">
                          {MARKETING_IMAGES[key].shot}
                        </p>

                        {override ? (
                          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] leading-[1.4] text-tm-text-3">
                            <div className="flex gap-1.5">
                              <dt className="font-semibold">Source</dt>
                              <dd className="tm-nums">
                                {override.storage_path
                                  ? "uploaded file"
                                  : (override.src ?? "manifest default")}
                              </dd>
                            </div>
                            <div className="flex gap-1.5">
                              <dt className="font-semibold">Crop</dt>
                              <dd className="tm-nums">{override.position ?? "centre"}</dd>
                            </div>
                            {override.alt ? (
                              <div className="flex min-w-0 gap-1.5">
                                <dt className="font-semibold">Alt text</dt>
                                <dd className="min-w-0 truncate">{override.alt}</dd>
                              </div>
                            ) : null}
                          </dl>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </details>
            </li>
          );
        })}
      </ul>

      {orphans.length > 0 ? (
        <p className="border-t border-tm-hairline px-5 py-4 text-[12px] leading-[1.5] font-medium text-tm-text-3">
          {orphans.length} override {orphans.length === 1 ? "row" : "rows"} in
          media_overrides no longer match a slot in the manifest and are
          rendered nowhere:{" "}
          <span className="tm-nums font-semibold text-tm-text-2">
            {orphans.map((row) => row.key).join(", ")}
          </span>
          . They are safe to delete in SQL.
        </p>
      ) : null}
    </div>
  );
}
