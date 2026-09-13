"use client";

import { useState } from "react";

import { AdminBadge } from "@/components/layout/admin";
import type { AdminSiteContentRow } from "@/db/queries/admin-content";
import { cn } from "@/lib/utils";

import {
  CONTENT_INPUT_CLASS,
  CONTENT_TEXTAREA_CLASS,
  ContentField,
  ContentSaveButton,
  useContentPatch,
} from "./admin-content-fields";

/**
 * `site_content` — the marketing copy blocks: FAQs, process steps, value props,
 * feature cards, fee lines, testimonials, stats, trust chips, the hero copy and
 * the quote screen's assurance cards.
 *
 * Grouped by `kind`, because the kind is what decides where a block appears and
 * an alphabetical list of forty slugs tells an admin nothing about which page
 * they are editing.
 *
 * `data` IS NOT EDITABLE HERE, deliberately. It is a per-kind payload — a fee
 * line's `value_source` names the live pricing figure the Fees page resolves at
 * render time, a feature card's `example_weight_lbs` feeds a worked
 * illustration, an assurance card's `icon` is a Phosphor glyph resolved through
 * a fixed map. A free-text JSON box over all of that invites an admin to rename
 * a `value_source` and silently take a live figure off the Fees page. Title,
 * body, order and publication are the safe surface, and they are what an admin
 * actually needs to change.
 */
export function AdminBlocksPanel({ blocks }: { blocks: readonly AdminSiteContentRow[] }) {
  const groups = new Map<string, AdminSiteContentRow[]>();
  for (const block of blocks) {
    const list = groups.get(block.kind) ?? [];
    list.push(block);
    groups.set(block.kind, list);
  }

  return (
    <div className="flex flex-col gap-8">
      {[...groups.entries()].map(([kind, rows]) => (
        <section key={kind} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="font-display text-[15px] leading-none font-bold text-tm-ink">
              {kindLabel(kind)}
            </h3>
            <span className="tm-nums text-[12px] leading-none font-medium text-tm-text-3">
              {rows.length} {rows.length === 1 ? "block" : "blocks"}
            </span>
          </div>
          <div className="flex flex-col divide-y divide-tm-hairline rounded-[16px] border border-tm-border px-4">
            {rows.map((block) => (
              <BlockRow key={block.id} block={block} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function BlockRow({ block }: { block: AdminSiteContentRow }) {
  const [title, setTitle] = useState(block.title ?? "");
  const [body, setBody] = useState(block.body ?? "");
  const [sortOrder, setSortOrder] = useState(block.sort_order.toString());
  const [isPublished, setIsPublished] = useState(block.is_published);
  const [expanded, setExpanded] = useState(false);
  const { patch, isSaving } = useContentPatch();

  const parsedSort = Number(sortOrder);
  const sortValid = Number.isInteger(parsedSort) && parsedSort >= 0;

  const isDirty =
    title !== (block.title ?? "") ||
    body !== (block.body ?? "") ||
    sortOrder !== block.sort_order.toString() ||
    isPublished !== block.is_published;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!sortValid) return;
    await patch(
      {
        target: "block",
        id: block.id,
        title: title.trim() || null,
        body: body.trim() || null,
        sort_order: parsedSort,
        is_published: isPublished,
      },
      {
        successTitle: `${block.slug} updated`,
        successDescription: isPublished
          ? "Visible on the storefront."
          : "Hidden from the storefront — unpublished blocks are filtered out of every read.",
      },
    );
  }

  const hasValueSource = typeof block.data.value_source === "string";

  return (
    <div className="py-3.5 first:pt-4 last:pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <span
            className={cn(
              "min-w-0 truncate text-[13px] leading-none font-semibold",
              isPublished ? "text-tm-ink" : "text-tm-text-3",
            )}
          >
            {block.title || block.slug}
          </span>
          {!isPublished ? <AdminBadge tone="muted">Hidden</AdminBadge> : null}
          {isDirty ? <AdminBadge tone="amber">Unsaved</AdminBadge> : null}
        </button>
        <code className="tm-nums shrink-0 text-[11px] leading-none font-medium text-tm-text-3">
          {block.slug}
        </code>
      </div>

      {expanded ? (
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <ContentField label="Title" htmlFor={`block-title-${block.id}`}>
            <input
              id={`block-title-${block.id}`}
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={CONTENT_INPUT_CLASS}
            />
          </ContentField>

          <ContentField label="Body" htmlFor={`block-body-${block.id}`}>
            <textarea
              id={`block-body-${block.id}`}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={4}
              className={CONTENT_TEXTAREA_CLASS}
            />
          </ContentField>

          <div className="flex flex-wrap items-end gap-5">
            <ContentField
              label="Position"
              htmlFor={`block-sort-${block.id}`}
              help="Lower numbers come first."
              className="w-28"
            >
              <input
                id={`block-sort-${block.id}`}
                type="number"
                min={0}
                step={1}
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
                aria-invalid={!sortValid}
                className={`${CONTENT_INPUT_CLASS} tm-nums`}
              />
            </ContentField>

            <label className="flex cursor-pointer items-center gap-2.5 pb-2.5 text-[13px] font-semibold text-tm-text-2">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(event) => setIsPublished(event.target.checked)}
                className="size-4 accent-[var(--tm-coral)]"
              />
              Show on the storefront
            </label>

            <div className="ml-auto pb-1">
              <ContentSaveButton isDirty={isDirty} isSaving={isSaving} />
            </div>
          </div>

          {hasValueSource ? (
            <p className="max-w-[70ch] rounded-[12px] bg-tm-paper px-3.5 py-2.5 text-[12px] leading-[1.5] font-medium text-tm-text-2">
              This block carries a live figure (
              <code className="tm-nums">{String(block.data.value_source)}</code>), resolved from
              the pricing engine when the page renders. Editing the words here never changes the
              number — that comes from pricing constants and groups.
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

/**
 * The `kind` slugs, in the words an admin would use for the place they appear.
 * Unknown kinds are humanised rather than hidden — a migration that adds one
 * must still be editable the day it lands.
 */
function kindLabel(kind: string): string {
  const known: Record<string, string> = {
    faq: "FAQs",
    testimonial: "Testimonials",
    process_step: "How it works — steps",
    value_prop: "Value propositions",
    feature_card: "Landing feature cards",
    fee_line: "Fees page — rows",
    compare_row: "Comparison rows",
    stat: "Landing statistics",
    trust_chip: "Trust chips",
    hero_copy: "Hero copy",
    store: "Store list",
    quote_assurance: "Quote screen — assurance cards",
  };
  if (known[kind]) return known[kind];
  const words = kind.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
