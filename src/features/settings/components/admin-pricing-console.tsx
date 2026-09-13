"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowsClockwise, WarningCircle } from "@phosphor-icons/react/ssr";

import { AdminBadge, AdminCard, AdminEmpty } from "@/components/layout/admin";
import type { AdminPricingConstantRow } from "@/db/queries/admin-money";
import type { WorkedExample } from "@/features/marketing/types";
import { apiFetch } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import type { ApiSuccessResponse } from "@/types/api";
import { AdminButton, AdminConfirm, AdminInput } from "./admin-controls";
import { formatConstant, fromInputValue, inputSuffix, toInputValue } from "./constant-format";

/**
 * The pricing console: the constants, and what they do to a real basket.
 *
 * WHAT WAS MISSING. The old screen was a list of numbers in boxes. An admin
 * could change the freight rate without any way of knowing whether that moved a
 * quote by two cedis or two hundred, and the only way to find out was to go and
 * price something in the storefront afterwards. So the constants sit beside a
 * worked example that is priced by the real engine, and every keystroke
 * re-prices it — through `/api/admin/pricing-constants/preview`, which applies
 * the proposed values WITHOUT saving them. The projection is the point: it is
 * how the consequence of a change becomes readable before it is a fact.
 *
 * Saving is per constant and always confirmed, because each one changes the
 * price of every quote taken afterwards, and the confirmation says so in
 * words along with the figure the example moves to.
 */

export interface AdminPricingConsoleProps {
  constants: AdminPricingConstantRow[];
  /** Required keys with no usable row — a real hole in the configuration. */
  missingKeys: string[];
  /** The example priced at the values currently stored. Null when it could not be priced. */
  example: WorkedExample | null;
  /** Why the example could not be priced, in the engine's own words. */
  exampleError: string | null;
}

/**
 * Reading order, grouped by what an admin is actually changing. Any key not
 * listed still renders, under "Other" — a constant that exists must never be
 * invisible just because this list has not caught up with a migration.
 */
const SECTIONS: { title: string; blurb: string; keys: string[] }[] = [
  {
    title: "Freight",
    blurb: "The two knobs behind every weight-based group, and the floor applied to a listed weight.",
    keys: ["freight_rate_per_lb", "handling_fee_usd", "minimum_chargeable_weight_lbs"],
  },
  {
    title: "Fee and tax",
    blurb: "Tomame's cut where a group does not set its own, and the tax tier per buying region.",
    keys: ["default_value_fee_pct", "minimum_tax_usd", "tax_pct_usa", "tax_pct_uk", "tax_pct_china"],
  },
  {
    title: "Exchange",
    blurb: "What is added to the mid-market USD→GHS rate before a customer is charged.",
    keys: ["fx_buffer_pct"],
  },
];

export function AdminPricingConsole({
  constants,
  missingKeys,
  example,
  exampleError,
}: AdminPricingConsoleProps) {
  const router = useRouter();

  // The typed value per key, as a string, so a half-typed "0." is not coerced
  // into a saved number behind the admin's back.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<WorkedExample | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [pendingSave, setPendingSave] = useState<AdminPricingConstantRow | null>(null);
  const [saving, setSaving] = useState(false);

  const byKey = useMemo(
    () => new Map(constants.map((constant) => [constant.key, constant])),
    [constants],
  );

  /**
   * Only the constants that actually differ from what is stored. An override
   * equal to the stored value is not an override, and sending it would make the
   * "unsaved changes" state lie.
   */
  const overrides = useMemo(() => {
    const result: Record<string, number> = {};
    for (const [key, raw] of Object.entries(drafts)) {
      const constant = byKey.get(key);
      if (!constant) continue;
      const parsed = fromInputValue(raw, constant.unit);
      if (parsed == null || parsed === constant.value) continue;
      result[key] = parsed;
    }
    return result;
  }, [drafts, byKey]);

  const changedKeys = Object.keys(overrides);
  const hasChanges = changedKeys.length > 0;

  // ── Live projection ────────────────────────────────────────────────────────
  const requestId = useRef(0);

  const runPreview = useCallback(
    async (next: Record<string, number>) => {
      if (!example) return;
      const id = ++requestId.current;
      setPreviewing(true);
      try {
        const res = await apiFetch<ApiSuccessResponse<WorkedExample>>(
          "/api/admin/pricing-constants/preview",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ input: example.input, overrides: next }),
          },
        );
        // Discard a response that a later keystroke has already superseded, so
        // the panel cannot settle on a stale projection.
        if (id !== requestId.current) return;
        setPreview(res.data);
        setPreviewError(null);
      } catch (error) {
        if (id !== requestId.current) return;
        setPreview(null);
        setPreviewError(error instanceof Error ? error.message : "Could not price that.");
      } finally {
        if (id === requestId.current) setPreviewing(false);
      }
    },
    [example],
  );

  useEffect(() => {
    if (!hasChanges) {
      requestId.current += 1;
      setPreview(null);
      setPreviewError(null);
      setPreviewing(false);
      return;
    }
    // Debounced: a preview is a real pricing run against the database, and
    // firing one per keystroke would hammer it for answers nobody reads.
    const timer = window.setTimeout(() => void runPreview(overrides), 400);
    return () => window.clearTimeout(timer);
  }, [overrides, hasChanges, runPreview]);

  // ── Saving ─────────────────────────────────────────────────────────────────
  async function save(constant: AdminPricingConstantRow) {
    const raw = drafts[constant.key];
    const value = raw == null ? null : fromInputValue(raw, constant.unit);
    if (value == null) {
      toast.error({
        title: "That is not a usable value",
        description: `${constant.label} needs a number of zero or more.`,
      });
      return;
    }

    setSaving(true);
    try {
      await apiFetch("/api/admin/pricing-constants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: constant.key, value }),
      });
      toast.success({
        title: `${constant.label} saved`,
        description: "Every quote taken from now on uses the new value.",
      });
      setDrafts((current) => {
        const next = { ...current };
        delete next[constant.key];
        return next;
      });
      setPendingSave(null);
      router.refresh();
    } catch (error) {
      toast.error({
        title: `Could not save ${constant.label}`,
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  const listed = new Set(SECTIONS.flatMap((section) => section.keys));
  const others = constants.filter((constant) => !listed.has(constant.key));
  const sections = [
    ...SECTIONS.map((section) => ({
      ...section,
      rows: section.keys
        .map((key) => byKey.get(key))
        .filter((row): row is AdminPricingConstantRow => row != null),
    })),
    ...(others.length > 0
      ? [
          {
            title: "Other",
            blurb:
              "Constants the calculator does not read, set by other parts of the platform. Changing one here changes it there.",
            rows: others,
          },
        ]
      : []),
  ].filter((section) => section.rows.length > 0);

  const pendingValue =
    pendingSave != null ? fromInputValue(drafts[pendingSave.key] ?? "", pendingSave.unit) : null;

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_1fr] xl:items-start">
      {/* ── The knobs ─────────────────────────────────────────────────────── */}
      <AdminCard
        title="Pricing constants"
        blurb="Everything in a landed price except the item price and the group's own freight. A saved change applies to the next quote, not to one a customer already holds."
        index={1}
        action={
          hasChanges ? (
            <AdminButton variant="quiet" onClick={() => setDrafts({})}>
              Discard {changedKeys.length} {changedKeys.length === 1 ? "change" : "changes"}
            </AdminButton>
          ) : null
        }
      >
        {constants.length === 0 ? (
          <AdminEmpty
            title="No pricing constants"
            body="The pricing_constants table is empty, so nothing can be priced at all. Run the migrations for this database before using this screen."
          />
        ) : (
          <div className="flex flex-col gap-6">
            {missingKeys.length > 0 ? (
              <div className="flex items-start gap-2.5 rounded-[14px] bg-tm-amber-bg px-4 py-3">
                <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-tm-amber" />
                <p className="text-[13px] leading-[1.5] font-medium text-[#7a4a06]">
                  {missingKeys.length === 1 ? "One constant the calculator reads has" : `${missingKeys.length} constants the calculator reads have`}{" "}
                  no row: <span className="font-mono">{missingKeys.join(", ")}</span>. Quotes are
                  falling back to a literal written in the code, which is not what this screen
                  says is configured.
                </p>
              </div>
            ) : null}

            {sections.map((section) => (
              <section key={section.title} className="flex flex-col gap-1.5">
                <h3 className="text-[12px] leading-none font-bold tracking-normal text-tm-text-2">
                  {section.title}
                </h3>
                <p className="mb-1 max-w-[56ch] text-[12px] leading-[1.5] font-medium text-tm-text-3">
                  {section.blurb}
                </p>
                <div className="flex flex-col">
                  {section.rows.map((constant) => (
                    <ConstantRow
                      key={constant.key}
                      constant={constant}
                      draft={drafts[constant.key]}
                      onDraft={(value) =>
                        setDrafts((current) => ({ ...current, [constant.key]: value }))
                      }
                      onReset={() =>
                        setDrafts((current) => {
                          const next = { ...current };
                          delete next[constant.key];
                          return next;
                        })
                      }
                      onSave={() => setPendingSave(constant)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </AdminCard>

      {/* ── The consequence ───────────────────────────────────────────────── */}
      <WorkedExamplePanel
        example={example}
        exampleError={exampleError}
        preview={preview}
        previewError={previewError}
        previewing={previewing}
        changedCount={changedKeys.length}
      />

      <AdminConfirm
        open={pendingSave != null}
        onOpenChange={(open) => {
          if (!open) setPendingSave(null);
        }}
        title={pendingSave ? `Change ${pendingSave.label}?` : ""}
        consequence="This changes the price of every quote produced from now on. Quotes a customer already holds keep the rate they were locked at, and orders already placed are untouched."
        detail={
          pendingSave ? (
            <div className="flex flex-col gap-2">
              <p>
                <span className="font-semibold">{pendingSave.label}</span>{" "}
                <span className="tm-nums">{formatConstant(pendingSave.value, pendingSave.unit)}</span>{" "}
                →{" "}
                <span className="tm-nums font-semibold">
                  {pendingValue != null
                    ? formatConstant(pendingValue, pendingSave.unit)
                    : "not a usable value"}
                </span>
              </p>
              {example && preview ? (
                <p className="text-tm-text-2">
                  The worked example moves from{" "}
                  <span className="tm-nums font-semibold text-tm-ink">
                    {example.total_ghs_display}
                  </span>{" "}
                  to{" "}
                  <span className="tm-nums font-semibold text-tm-ink">
                    {preview.total_ghs_display}
                  </span>
                  .
                </p>
              ) : null}
            </div>
          ) : null
        }
        confirmLabel="Save and apply"
        onConfirm={() => {
          if (pendingSave) void save(pendingSave);
        }}
        busy={saving}
      />
    </div>
  );
}

// ── One constant ─────────────────────────────────────────────────────────────

function ConstantRow({
  constant,
  draft,
  onDraft,
  onReset,
  onSave,
}: {
  constant: AdminPricingConstantRow;
  draft: string | undefined;
  onDraft: (value: string) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  const stored = toInputValue(constant.value, constant.unit);
  const current = draft ?? stored;
  const parsed = fromInputValue(current, constant.unit);
  const changed = parsed != null && parsed !== constant.value;
  const invalid = current.trim() !== "" && parsed == null;
  const inputId = `pricing-constant-${constant.key}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-tm-hairline py-3 last:border-0">
      <div className="min-w-[200px] flex-1">
        <label
          htmlFor={inputId}
          className="block text-[13px] leading-none font-semibold text-tm-ink"
        >
          {constant.label || constant.key}
        </label>
        <p className="mt-1 max-w-[48ch] text-[12px] leading-[1.45] font-medium text-tm-text-3">
          {constant.description || constant.key}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {changed ? (
          <span className="tm-nums text-[12px] font-medium text-tm-text-3 line-through">
            {formatConstant(constant.value, constant.unit)}
          </span>
        ) : null}
        <AdminInput
          id={inputId}
          type="number"
          step="any"
          min="0"
          inputMode="decimal"
          value={current}
          suffix={inputSuffix(constant.unit)}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${inputId}-error` : undefined}
          onChange={(event) => onDraft(event.target.value)}
          className="w-28"
        />
        {changed ? (
          <>
            <AdminButton variant="primary" onClick={onSave}>
              Save
            </AdminButton>
            <AdminButton variant="quiet" onClick={onReset}>
              Reset
            </AdminButton>
          </>
        ) : null}
      </div>
      {invalid ? (
        <p id={`${inputId}-error`} className="w-full text-[12px] font-medium text-tm-coral-strong">
          {constant.label} needs a number of zero or more.
        </p>
      ) : null}
    </div>
  );
}

// ── The worked example ───────────────────────────────────────────────────────

function WorkedExamplePanel({
  example,
  exampleError,
  preview,
  previewError,
  previewing,
  changedCount,
}: {
  example: WorkedExample | null;
  exampleError: string | null;
  preview: WorkedExample | null;
  previewError: string | null;
  previewing: boolean;
  changedCount: number;
}) {
  const shown = preview ?? example;

  return (
    <AdminCard
      title="What a real basket costs"
      blurb="The Fees page's worked example, priced by the live engine. Not an illustration — change a constant and this moves with it."
      index={2}
      action={
        changedCount > 0 ? (
          <AdminBadge tone="amber">
            {previewing ? (
              <>
                <ArrowsClockwise size={12} weight="bold" className="animate-spin" />
                Re-pricing
              </>
            ) : (
              `Unsaved · ${changedCount} ${changedCount === 1 ? "change" : "changes"}`
            )}
          </AdminBadge>
        ) : null
      }
    >
      {!example ? (
        <AdminEmpty
          title="The example cannot be priced"
          body={
            exampleError ??
            "The pricing engine refused to price the worked example. Until it can, nothing on the storefront can be quoted either."
          }
        />
      ) : (
        <div className="flex flex-col gap-4" aria-live="polite" aria-busy={previewing || undefined}>
          <p className="text-[13px] leading-[1.5] font-medium text-tm-text-2">{shown!.headline}</p>

          <dl className="flex flex-col gap-2.5">
            {shown!.rows.map((row) => (
              <div key={row.key} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[12px] font-semibold text-tm-text-2">{row.label}</dt>
                  <dd className="tm-nums text-[13px] font-semibold text-tm-ink">{row.value}</dd>
                </div>
                {row.bar_pct > 0 ? (
                  <div className="h-1.5 overflow-hidden rounded-full bg-tm-paper">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        row.tone === "accent"
                          ? "bg-tm-coral"
                          : row.tone === "ink"
                            ? "bg-tm-ink"
                            : "bg-tm-border",
                      )}
                      style={{ width: `${row.bar_pct}%` }}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </dl>

          {shown!.needs_review ? (
            <p className="rounded-[14px] bg-tm-amber-bg px-4 py-3 text-[13px] leading-[1.5] font-medium text-[#7a4a06]">
              With these values the engine cannot price this basket at all — it would go to a human
              for review. {shown!.breakdown.review_reason}
            </p>
          ) : (
            <div className="flex flex-col gap-1 rounded-[16px] bg-tm-paper px-4 py-3.5">
              <span className="text-[12px] font-semibold text-tm-text-2">Customer pays</span>
              <span className="tm-nums font-display text-[26px] leading-none font-bold text-tm-ink">
                {shown!.total_ghs_display}
              </span>
              <span className="tm-nums text-[12px] font-medium text-tm-text-3">
                {shown!.total_usd_display} · {shown!.tomame_keeps_display}
              </span>
              {preview ? (
                <span className="tm-nums mt-1.5 text-[12px] font-semibold text-tm-amber">
                  Currently {example.total_ghs_display} — this is what your unsaved change would
                  make it.
                </span>
              ) : null}
            </div>
          )}

          {previewError ? (
            <p className="text-[12px] leading-[1.5] font-medium text-tm-coral-strong">
              {previewError}
            </p>
          ) : null}
        </div>
      )}
    </AdminCard>
  );
}
