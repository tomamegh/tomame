"use client";

import { useState } from "react";

import { AdminBadge } from "@/components/layout/admin";
import type { AdminRegionRow } from "@/db/queries/admin-content";

import {
  regionStatusBadge,
  regionStatusHelp,
  transitWindowLabel,
  type RegionStatus,
} from "./admin-content-format";
import {
  CONTENT_INPUT_CLASS,
  CONTENT_TEXTAREA_CLASS,
  ContentField,
  ContentSaveButton,
  useContentPatch,
} from "./admin-content-fields";

/**
 * `regions` — the purchasing lanes.
 *
 * The status dropdown is the most powerful control on the content screen: it
 * rewrites the storefront's "Where we buy" card with no deploy. `live` is
 * purchasable, `soon` swaps the buy path for a waitlist form, `off` removes the
 * lane entirely — so the current status is spelled out in a sentence under the
 * control rather than left as one of three slugs in a select.
 *
 * The store list and the photo are NOT editable here. `store_names` is a
 * Postgres text array the lane card renders as chips and `photo_key` points
 * into the shipped image manifest — both are fine to change, but neither is
 * text an admin can safely retype into a single box, and a half-built editor
 * for them would be worse than sending the change through a migration.
 */
export function AdminRegionsPanel({ regions }: { regions: readonly AdminRegionRow[] }) {
  return (
    <div className="flex flex-col divide-y divide-tm-hairline">
      {regions.map((region) => (
        <RegionRow key={region.code} region={region} />
      ))}
    </div>
  );
}

function RegionRow({ region }: { region: AdminRegionRow }) {
  const [status, setStatus] = useState<RegionStatus>(region.status);
  const [hubCity, setHubCity] = useState(region.hub_city ?? "");
  const [minDays, setMinDays] = useState(region.transit_days_min?.toString() ?? "");
  const [maxDays, setMaxDays] = useState(region.transit_days_max?.toString() ?? "");
  const [blurb, setBlurb] = useState(region.blurb ?? "");
  const { patch, isSaving } = useContentPatch();

  const isDirty =
    status !== region.status ||
    hubCity !== (region.hub_city ?? "") ||
    minDays !== (region.transit_days_min?.toString() ?? "") ||
    maxDays !== (region.transit_days_max?.toString() ?? "") ||
    blurb !== (region.blurb ?? "");

  const badge = regionStatusBadge(status);
  const window = transitWindowLabel(toNumberOrNull(minDays), toNumberOrNull(maxDays));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await patch(
      {
        target: "region",
        code: region.code,
        status,
        hub_city: hubCity.trim() || null,
        transit_days_min: toNumberOrNull(minDays),
        transit_days_max: toNumberOrNull(maxDays),
        blurb: blurb.trim() || null,
      },
      {
        successTitle: `${region.name} updated`,
        successDescription:
          status === "live"
            ? "Customers can buy from this lane."
            : status === "soon"
              ? "The lane now shows a waitlist form instead of a buy path."
              : "The lane is hidden from the storefront.",
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] leading-none font-semibold text-tm-ink">
              {region.name}
            </span>
            <AdminBadge tone={badge.tone}>{badge.label}</AdminBadge>
          </div>
          <p className="tm-nums text-[12px] leading-none font-medium text-tm-text-3">
            {region.code}
            {region.store_names.length > 0 ? ` · ${region.store_names.join(", ")}` : null}
            {window ? ` · ${window}` : null}
          </p>
        </div>
        <ContentSaveButton isDirty={isDirty} isSaving={isSaving} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ContentField
          label="Status"
          htmlFor={`region-status-${region.code}`}
          help={regionStatusHelp(status)}
          className="sm:col-span-2"
        >
          <select
            id={`region-status-${region.code}`}
            value={status}
            onChange={(event) => setStatus(event.target.value as RegionStatus)}
            className={CONTENT_INPUT_CLASS}
          >
            <option value="live">Live — customers can buy</option>
            <option value="soon">Coming soon — waitlist only</option>
            <option value="off">Hidden — not shown at all</option>
          </select>
        </ContentField>

        <ContentField label="Hub city" htmlFor={`region-hub-${region.code}`}>
          <input
            id={`region-hub-${region.code}`}
            type="text"
            value={hubCity}
            onChange={(event) => setHubCity(event.target.value)}
            placeholder="e.g. Delaware"
            className={CONTENT_INPUT_CLASS}
          />
        </ContentField>

        <ContentField
          label="Transit window (days)"
          htmlFor={`region-min-${region.code}`}
          help="Shown on the lane card. Leave either blank to show an open-ended window."
        >
          <div className="flex items-center gap-2">
            <input
              id={`region-min-${region.code}`}
              type="number"
              min={0}
              max={365}
              value={minDays}
              onChange={(event) => setMinDays(event.target.value)}
              aria-label="Shortest transit in days"
              className={`${CONTENT_INPUT_CLASS} tm-nums`}
            />
            <span className="text-[13px] font-semibold text-tm-text-3">to</span>
            <input
              type="number"
              min={0}
              max={365}
              value={maxDays}
              onChange={(event) => setMaxDays(event.target.value)}
              aria-label="Longest transit in days"
              className={`${CONTENT_INPUT_CLASS} tm-nums`}
            />
          </div>
        </ContentField>
      </div>

      <ContentField
        label="Blurb"
        htmlFor={`region-blurb-${region.code}`}
        help="One or two lines under the lane's name on “Where we buy”."
      >
        <textarea
          id={`region-blurb-${region.code}`}
          value={blurb}
          onChange={(event) => setBlurb(event.target.value)}
          rows={2}
          className={CONTENT_TEXTAREA_CLASS}
        />
      </ContentField>
    </form>
  );
}

/** "" → null, so a cleared field stores NULL rather than 0 days of transit. */
function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}
