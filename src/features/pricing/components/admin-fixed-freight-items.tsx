"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CaretDown, MagnifyingGlass, Plus } from "@phosphor-icons/react/ssr";

import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminEmpty,
  AdminInput,
} from "@/components/layout/admin";
import { TomameCategory } from "@/config/categories/tomame_category";
import type { AdminFixedFreightItemRow } from "@/db/queries/fixed-freight-items";
import { ApiFetchError, apiFetch } from "@/lib/api-client";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";

/**
 * The fixed freight price list: pre-negotiated cedi rates for products the
 * matcher recognises by keyword ("iPhone 13 Pro & Max", "PS5").
 *
 * Rows are grouped by shelf, the table's `category`. A shelf decides which
 * product categories an item may price (`FIXED_FREIGHT_CATEGORY_MAP`, in code);
 * a shelf that is not in that map is ungated and matched on keywords alone,
 * which is flagged here because it is the easy way to misprice a phone case.
 *
 * Nothing is deleted. Quotes remember which item priced them, so a row is
 * retired by deactivating it. Every write goes through
 * `/api/admin/fixed-freight-items`, which validates and audits.
 */

export interface AdminFixedFreightItemsProps {
  items: AdminFixedFreightItemRow[];
  /** Shelves the category gate knows (keys of FIXED_FREIGHT_CATEGORY_MAP). */
  gatedShelves: string[];
}

const TOMAME_CATEGORY_VALUES = Object.values(TomameCategory) as string[];

const ghs = (n: number) =>
  `GH₵ ${n.toLocaleString("en-GH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const parseKeywords = (raw: string) => [
  ...new Set(
    raw
      .split(",")
      .map((k) => k.trim().toLowerCase().replace(/\s+/g, " "))
      .filter(Boolean),
  ),
];

export function AdminFixedFreightItems({
  items,
  gatedShelves,
}: AdminFixedFreightItemsProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const gated = useMemo(() => new Set(gatedShelves), [gatedShelves]);
  const shelves = useMemo(
    () => [...new Set(items.map((i) => i.category))].sort(),
    [items],
  );
  const ungatedShelves = shelves.filter((s) => !gated.has(s));

  const needle = query.trim().toLowerCase();
  const grouped = useMemo(() => {
    const map = new Map<string, AdminFixedFreightItemRow[]>();
    for (const item of items) {
      if (
        needle &&
        !item.product_name.toLowerCase().includes(needle) &&
        !item.keywords.some((k) => k.includes(needle)) &&
        !item.category.toLowerCase().includes(needle)
      ) {
        continue;
      }
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items, needle]);

  const activeCount = items.filter((i) => i.is_active).length;

  function toggle(shelf: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(shelf)) next.delete(shelf);
      else next.add(shelf);
      return next;
    });
  }

  function saved() {
    setEditingId(null);
    setAdding(false);
    router.refresh();
  }

  return (
    <AdminCard
      title="Fixed freight rates"
      blurb={`Pre-negotiated freight for recognised products, charged per item instead of the group's rate. ${activeCount} active of ${items.length}. A change applies to the next quote, never to a price a customer already holds.`}
      flush
      index={5}
      action={
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="relative w-full sm:w-auto">
            <MagnifyingGlass
              size={14}
              weight="bold"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-tm-text-3"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name or keyword"
              aria-label="Search fixed freight items by name or keyword"
              className="h-9 w-full rounded-full border border-tm-border bg-tm-paper pr-3 pl-8 text-[13px] font-medium text-tm-ink outline-none placeholder:text-tm-text-3 focus:border-tm-coral/50 sm:w-[220px]"
            />
          </div>
          <AdminButton
            variant={adding ? "secondary" : "primary"}
            onClick={() => setAdding((a) => !a)}
            aria-expanded={adding}
          >
            <Plus size={14} weight="bold" />
            Add item
          </AdminButton>
        </div>
      }
    >
      <div className="flex flex-col gap-4 px-5 pt-5">
        {ungatedShelves.length > 0 ? (
          <p className="rounded-[14px] bg-tm-amber-bg px-4 py-3 text-[13px] leading-[1.55] font-medium text-[#7a4a06]">
            {ungatedShelves.length === 1 ? "The shelf " : "The shelves "}
            <strong>{ungatedShelves.join(", ")}</strong>{" "}
            {ungatedShelves.length === 1 ? "is" : "are"} not in the category
            gate, so {ungatedShelves.length === 1 ? "its" : "their"} items match
            on keywords alone, whatever the product&rsquo;s category. Ask
            engineering to add {ungatedShelves.length === 1 ? "it" : "them"} to{" "}
            <code>FIXED_FREIGHT_CATEGORY_MAP</code>.
          </p>
        ) : null}

        {adding ? (
          <ItemForm
            shelves={shelves}
            gated={gated}
            onCancel={() => setAdding(false)}
            onSaved={saved}
          />
        ) : null}

        <TitleTester />
      </div>

      {items.length === 0 ? (
        <div className="p-5">
          <AdminEmpty
            title="No fixed freight items"
            body="Nothing is priced at a negotiated rate: every product falls back to its pricing group. Add an item, or run the seed migrations for this database."
          />
        </div>
      ) : grouped.length === 0 ? (
        <div className="p-5">
          <AdminEmpty
            title="Nothing matches"
            body="No item's name or keywords contain that. Clear the search to see the full list."
          />
        </div>
      ) : (
        <div className="mt-5 flex flex-col">
          {grouped.map(([shelf, rows]) => {
            const expanded = needle !== "" || open.has(shelf);
            const inactive = rows.filter((r) => !r.is_active).length;
            return (
              <section key={shelf} className="border-t border-tm-hairline">
                <button
                  type="button"
                  onClick={() => toggle(shelf)}
                  aria-expanded={expanded}
                  className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-tm-paper/60"
                >
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-[13px] font-bold text-tm-ink">
                      {shelf}
                    </span>
                    <span className="tm-nums text-[12px] font-medium text-tm-text-3">
                      {rows.length} {rows.length === 1 ? "item" : "items"}
                      {inactive ? `, ${inactive} off` : ""}
                    </span>
                    {!gated.has(shelf) ? (
                      <AdminBadge tone="amber">Keyword only</AdminBadge>
                    ) : null}
                  </span>
                  <CaretDown
                    size={14}
                    weight="bold"
                    className={cn(
                      "shrink-0 text-tm-text-3 transition-transform",
                      expanded && "rotate-180",
                    )}
                  />
                </button>
                {expanded ? (
                  <ul className="flex flex-col">
                    {rows.map((item) =>
                      editingId === item.id ? (
                        <li
                          key={item.id}
                          className="border-t border-tm-hairline px-5 py-4"
                        >
                          <ItemForm
                            item={item}
                            shelves={shelves}
                            gated={gated}
                            onCancel={() => setEditingId(null)}
                            onSaved={saved}
                          />
                        </li>
                      ) : (
                        <ItemRow
                          key={item.id}
                          item={item}
                          onEdit={() => setEditingId(item.id)}
                        />
                      ),
                    )}
                  </ul>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </AdminCard>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────

function ItemRow({
  item,
  onEdit,
}: {
  item: AdminFixedFreightItemRow;
  onEdit: () => void;
}) {
  return (
    <li
      className={cn(
        "flex items-start justify-between gap-3 border-t border-tm-hairline px-5 py-3.5",
        !item.is_active && "opacity-55",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-tm-ink">
          <span className="break-words">{item.product_name}</span>
          {!item.is_active ? (
            <AdminBadge tone="muted">Deactivated</AdminBadge>
          ) : null}
        </span>
        <span className="flex flex-wrap gap-1">
          {item.keywords.map((k) => (
            <span
              key={k}
              className="max-w-full rounded-full bg-tm-paper px-2 py-0.5 text-[11px] font-medium break-all text-tm-text-2"
            >
              {k}
            </span>
          ))}
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <span className="tm-nums text-[14px] font-bold whitespace-nowrap text-tm-ink">
          {ghs(item.freight_rate_ghs)}
        </span>
        <AdminButton onClick={onEdit} aria-label={`Edit ${item.product_name}`}>
          Edit
        </AdminButton>
      </div>
    </li>
  );
}

// ── Create / edit form ───────────────────────────────────────────────────────

function ItemForm({
  item,
  shelves,
  gated,
  onCancel,
  onSaved,
}: {
  item?: AdminFixedFreightItemRow;
  shelves: string[];
  gated: Set<string>;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const idPrefix = item ? `ffi-${item.id}` : "ffi-new";
  const [shelf, setShelf] = useState(item?.category ?? "");
  const [name, setName] = useState(item?.product_name ?? "");
  const [rate, setRate] = useState(item ? String(item.freight_rate_ghs) : "");
  const [keywords, setKeywords] = useState(item?.keywords.join(", ") ?? "");
  const [sortOrder, setSortOrder] = useState(
    item ? String(item.sort_order) : "0",
  );
  const [active, setActive] = useState(item?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 409: the row changed since this editor loaded it; the edit is against a stale copy.
  const [conflict, setConflict] = useState(false);
  const router = useRouter();

  const parsedKeywords = parseKeywords(keywords);
  const shelfKey = shelf.trim().replace(/\s+/g, " ").toUpperCase();
  const rateNum = Number(rate);

  function build(): Record<string, unknown> | string {
    if (!shelfKey) return "Choose or type a shelf.";
    if (!name.trim()) return "An item needs a product name.";
    if (!rate.trim() || !Number.isFinite(rateNum) || rateNum <= 0)
      return "The rate must be a number of cedis above zero.";
    if (parsedKeywords.length === 0)
      return "Add at least one keyword, separated by commas.";
    const sort = Number(sortOrder);
    if (!Number.isInteger(sort) || sort < 0)
      return "Sort order must be a whole number, 0 or more.";
    const full = {
      category: shelfKey,
      product_name: name.trim(),
      freight_rate_ghs: rateNum,
      keywords: parsedKeywords,
      sort_order: sort,
      is_active: active,
    };
    if (!item) return full;
    // Send only what changed, so the audit row says what the admin did.
    const patch: Record<string, unknown> = {};
    if (full.category !== item.category) patch.category = full.category;
    if (full.product_name !== item.product_name)
      patch.product_name = full.product_name;
    if (full.freight_rate_ghs !== item.freight_rate_ghs)
      patch.freight_rate_ghs = full.freight_rate_ghs;
    if (full.keywords.join("\n") !== item.keywords.join("\n"))
      patch.keywords = full.keywords;
    if (full.sort_order !== item.sort_order) patch.sort_order = full.sort_order;
    if (full.is_active !== item.is_active) patch.is_active = full.is_active;
    return patch;
  }

  async function save() {
    const payload = build();
    if (typeof payload === "string") {
      setError(payload);
      return;
    }
    if (item && Object.keys(payload).length === 0) {
      onCancel();
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await apiFetch(
        item
          ? `/api/admin/fixed-freight-items/${item.id}`
          : "/api/admin/fixed-freight-items",
        {
          method: item ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            item ? { ...payload, expected_updated_at: item.updated_at } : payload,
          ),
        },
      );
      toast.success({
        title: item ? `${name.trim()} saved` : `${name.trim()} added`,
        description:
          "The next quote uses it. Prices customers already hold do not change.",
      });
      onSaved();
    } catch (err) {
      if (err instanceof ApiFetchError && err.status === 409) {
        setConflict(true);
        setError(
          "Someone else just changed this item. Reload to see their version, then make your edit again.",
        );
      } else {
        setError(
          err instanceof Error ? err.message : "Could not save this item.",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  function reload() {
    // Close the stale editor and fetch the current rows; reopening edits the fresh copy.
    onCancel();
    router.refresh();
  }

  const rateChanged =
    item &&
    Number.isFinite(rateNum) &&
    rateNum > 0 &&
    rateNum !== item.freight_rate_ghs;

  return (
    <div className="flex flex-col gap-4 rounded-[14px] border border-tm-border bg-tm-paper/50 p-4">
      <p className="text-[13px] font-bold text-tm-ink">
        {item ? `Edit ${item.product_name}` : "New fixed freight item"}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Product name" htmlFor={`${idPrefix}-name`}>
          <AdminInput
            id={`${idPrefix}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full"
          />
        </Field>
        <Field
          label="Freight rate"
          hint={
            rateChanged
              ? `Was ${ghs(item.freight_rate_ghs)}, per item.`
              : "Per item, in cedis."
          }
          htmlFor={`${idPrefix}-rate`}
        >
          {/* A flex-col child stretches; the wrapper keeps the GH₵ suffix against the field. */}
          <span className="self-start">
            <AdminInput
              id={`${idPrefix}-rate`}
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              suffix="GH₵"
              className="w-40"
            />
          </span>
        </Field>
        <Field
          label="Shelf"
          hint={
            shelfKey && !gated.has(shelfKey)
              ? "Not in the category gate: keyword-only matching."
              : undefined
          }
          htmlFor={`${idPrefix}-shelf`}
        >
          <AdminInput
            id={`${idPrefix}-shelf`}
            list={`${idPrefix}-shelves`}
            value={shelf}
            onChange={(e) => setShelf(e.target.value)}
            className="w-full"
          />
          <datalist id={`${idPrefix}-shelves`}>
            {shelves.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field
          label="Sort order"
          hint="Lower wins a tie between equally long keywords."
          htmlFor={`${idPrefix}-sort`}
        >
          <AdminInput
            id={`${idPrefix}-sort`}
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="w-28"
          />
        </Field>
      </div>

      <Field
        label="Keywords"
        hint="Comma separated. Whole-word match on the product title; the longest keyword across all items wins."
        htmlFor={`${idPrefix}-keywords`}
      >
        <AdminInput
          id={`${idPrefix}-keywords`}
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          className="w-full"
        />
        {parsedKeywords.length > 0 ? (
          <span className="flex flex-wrap gap-1">
            {parsedKeywords.map((k) => (
              <span
                key={k}
                className="max-w-full rounded-full bg-card px-2 py-0.5 text-[11px] font-medium break-all text-tm-text-2"
              >
                {k}
              </span>
            ))}
          </span>
        ) : null}
      </Field>

      <label className="flex items-center gap-2 text-[13px] font-medium text-tm-ink">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="size-4 accent-[var(--tm-coral)]"
        />
        Active
        {item?.is_active && !active ? (
          <span className="text-[12px] text-tm-text-3">
            (matching products fall back to their pricing group&rsquo;s freight)
          </span>
        ) : null}
      </label>

      {error ? (
        <p
          role="alert"
          className="text-[13px] font-medium text-tm-coral-strong"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <AdminButton variant="quiet" onClick={onCancel} disabled={saving}>
          Cancel
        </AdminButton>
        {conflict ? (
          <AdminButton variant="primary" onClick={reload}>
            Reload
          </AdminButton>
        ) : null}
        <AdminButton variant="primary" onClick={save} busy={saving} disabled={conflict}>
          {item ? "Save item" : "Add item"}
        </AdminButton>
      </div>
    </div>
  );
}

// ── Title tester ─────────────────────────────────────────────────────────────

interface TitleTestResult {
  match: {
    id: string;
    product_name: string;
    category: string;
    freight_rate_ghs: number;
    keyword: string;
  } | null;
  gated_out: number;
}

/** Runs the engine's matcher on the server against every active item. */
function TitleTester() {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TitleTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!title.trim()) {
      setError("Paste a product title to test.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: TitleTestResult }>(
        "/api/admin/fixed-freight-items/match",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, category: category || null }),
        },
      );
      setResult(res.data);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Could not run the test.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-[14px] border border-tm-border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run();
      }}
    >
      <div className="flex flex-col gap-1">
        <p className="text-[13px] font-bold text-tm-ink">Test a title</p>
        <p className="text-[12px] leading-[1.45] font-medium text-tm-text-3">
          Which active item a product would be priced by, using the same matcher
          as a quote.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Apple iPhone 13 Pro Max, 256GB, Graphite"
          aria-label="Product title"
          className="h-9 min-w-0 flex-1 rounded-[10px] border border-tm-border bg-card px-3 text-[13px] font-medium text-tm-ink outline-none placeholder:text-tm-text-3 focus:border-tm-coral/50"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Product category (optional)"
          className="h-9 min-w-0 rounded-[10px] border border-tm-border bg-card px-2.5 text-[13px] font-medium text-tm-ink outline-none focus:border-tm-coral/50 sm:w-[220px]"
        >
          <option value="">Any category</option>
          {TOMAME_CATEGORY_VALUES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <AdminButton type="submit" busy={busy}>
          Test
        </AdminButton>
      </div>
      {error ? (
        <p
          role="alert"
          className="text-[13px] font-medium text-tm-coral-strong"
        >
          {error}
        </p>
      ) : result ? (
        <p
          aria-live="polite"
          className="text-[13px] leading-[1.55] font-medium text-tm-text-2"
        >
          {result.match ? (
            <>
              Priced by{" "}
              <strong className="text-tm-ink">
                {result.match.product_name}
              </strong>{" "}
              ({result.match.category}) at{" "}
              <strong className="tm-nums text-tm-ink">
                {ghs(result.match.freight_rate_ghs)}
              </strong>
              , on the keyword &ldquo;{result.match.keyword}&rdquo;.
            </>
          ) : (
            <>
              No fixed item matches, so the product&rsquo;s pricing group sets
              its freight.
            </>
          )}
          {result.gated_out > 0
            ? ` ${result.gated_out} items were skipped because their shelf does not price this category.`
            : null}
        </p>
      ) : null}
    </form>
  );
}

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-[12px] leading-none font-bold tracking-normal text-tm-text-2"
      >
        {label}
      </label>
      {hint ? (
        <p className="max-w-[52ch] text-[12px] leading-[1.45] font-medium text-tm-text-3">
          {hint}
        </p>
      ) : null}
      {children}
    </div>
  );
}
