"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon, CheckIcon } from "lucide-react";

import { AdminButton, AdminCard } from "@/components/layout/admin";
import { Textarea } from "@/components/ui/textarea";
import { CAR_PRICE_STATES, type CarPriceState } from "@/config/constants";
import { carTitle, formatPesewas, suggestCarSlug } from "@/features/cars/format";
import type { CarListingView } from "@/features/cars/types";
import { apiFetch } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import type { ApiSuccessResponse } from "@/types/api";
import {
  BODY_TYPE_CHOICES,
  DRIVETRAIN_CHOICES,
  FUEL_CHOICES,
  MILEAGE_UNIT_CHOICES,
  ORIGIN_CHOICES,
  PRICE_STATE_CHOICES,
  TRANSMISSION_CHOICES,
  buildCarPayload,
  carFormFromListing,
  carFormProblem,
  describeBreakdown,
  emptyCarForm,
  priceStateProblem,
  withPriceState,
  type CarFormValues,
  type Choice,
} from "./car-form-state";

/**
 * Writing a car down — the one screen in Tomame where a human types a price
 * (migration 067).
 *
 * WHY THIS IS NOT THE PRODUCT'S USUAL SHAPE. Every other listing in Tomame is
 * extracted from a store page and priced by `lib/pricing/calculator.ts`; nobody
 * types a figure, and nobody can. A car has no page to read and no formula to
 * run — the landed price is an auction hammer price, an ocean freight quote, a
 * Customs valuation and our fee, three of which are quoted per vehicle by
 * somebody else. So this form takes numbers from a person, and everything below
 * exists to make the numbers it takes impossible to get wrong in the two ways
 * that matter.
 *
 * THE PRICE CONTROL IS THE POINT OF THE SCREEN. The state is chosen FIRST and
 * the money fields appear underneath it, so "fixed price with no price" and
 * "price on request, but priced" — the two combinations
 * `car_listings_price_state_has_price` refuses — are not states this form can be
 * left in. Choosing "price on request" CLEARS the amounts rather than hiding
 * them (`withPriceState`), and `buildCarPayload` derives the five money columns
 * from the chosen state rather than from the fields. An admin who has just typed
 * a listing meets a sentence, never a constraint name.
 *
 * AND THE BREAKDOWN ADDS UP AS IT IS TYPED. `car_listings_breakdown_sums_to_total`
 * refuses four components that disagree with the headline figure, and the
 * disagreement is usually a mistyped digit in the middle of the four. The
 * running sum under the fields names the difference in cedis while the admin is
 * still looking at the field that caused it.
 *
 * PUBLISHING IS NOT HERE. It is an explicit action with a stated consequence on
 * the listing screen, because taking a car off the site is how a sold or
 * mispriced vehicle stops being advertised and that decision deserves more than
 * a checkbox in a form. The form still SENDS `is_published` — a PUT is a full
 * replacement (`updateCarListingSchema`), so a form that omitted it would be
 * rejected and one that hard-coded `false` would quietly unpublish a live car
 * every time somebody corrected its mileage.
 */

export type CarFormMode =
  | { kind: "create" }
  /** Editing carries the listing so the form can echo its current publish state. */
  | { kind: "edit"; car: CarListingView };

export function CarForm({ mode }: { mode: CarFormMode }) {
  const router = useRouter();
  const editing = mode.kind === "edit";

  const [values, setValues] = useState<CarFormValues>(() =>
    mode.kind === "edit" ? carFormFromListing(mode.car) : emptyCarForm(),
  );
  // An admin who has edited the link keeps their spelling. Before they touch it,
  // the suggestion follows the car's name — which is the only thing that stops
  // twenty listings called `car-1`.
  const [slugTouched, setSlugTouched] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const problem = carFormProblem(values);
  const priceProblem = priceStateProblem(values);
  const breakdown = describeBreakdown(values);
  const title = useMemo(
    () =>
      carTitle({
        year: Number(values.year) || new Date().getUTCFullYear(),
        make: values.make || "car",
        model: values.model,
        trim: values.trim,
      }),
    [values.year, values.make, values.model, values.trim],
  );

  function set<K extends keyof CarFormValues>(key: K, value: CarFormValues[K]) {
    setDirty(true);
    setValues((current) => {
      const next = { ...current, [key]: value };
      if (!slugTouched && (key === "year" || key === "make" || key === "model" || key === "trim")) {
        next.slug = suggestCarSlug({
          year: Number(next.year) || 0,
          make: next.make,
          model: next.model,
          trim: next.trim,
        });
      }
      return next;
    });
  }

  function choosePriceState(state: CarPriceState) {
    setDirty(true);
    setValues((current) => withPriceState(current, state));
  }

  async function save() {
    if (saving) return;

    const built = buildCarPayload(
      values,
      // The listing's CURRENT state, never a hard-coded value. See the header.
      mode.kind === "edit" ? mode.car.is_published : false,
    );
    if (!built.ok) {
      toast.error({ title: "Not saved", description: built.problem });
      return;
    }

    setSaving(true);
    try {
      const response = await apiFetch<ApiSuccessResponse<CarListingView>>(
        editing ? `/api/admin/cars/${(mode as { car: CarListingView }).car.id}` : "/api/admin/cars",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(built.body),
        },
      );

      setDirty(false);
      toast.success({
        title: editing ? "Listing saved" : "Listing created",
        description: editing
          ? response.data.is_published
            ? "The car's page is updated. It is live on the site."
            : "Saved as a draft. Nothing has reached the site."
          : "Saved as a draft. Add the photographs, then publish it.",
      });

      if (editing) {
        router.refresh();
      } else {
        router.push(`/admin/cars/${response.data.id}`);
        router.refresh();
      }
    } catch (error) {
      toast.error({
        title: editing ? "Could not save the listing" : "Could not create the listing",
        description: error instanceof Error ? error.message : "Please try again.",
      });
      setSaving(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* ── The vehicle ───────────────────────────────────────────────── */}
      <AdminCard
        index={0}
        title="The vehicle"
        blurb="What a buyer is looking at. The odometer reading is printed in the unit it was taken in and is never converted: a Japanese import reads in kilometres and an American one in miles, and they are not the same car."
      >
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TextField
            id="car-make"
            label="Make"
            required
            value={values.make}
            onChange={(value) => set("make", value)}
            placeholder="Toyota"
          />
          <TextField
            id="car-model"
            label="Model"
            required
            value={values.model}
            onChange={(value) => set("model", value)}
            placeholder="Highlander"
          />
          <TextField
            id="car-trim"
            label="Trim"
            value={values.trim}
            onChange={(value) => set("trim", value)}
            placeholder="XLE"
            hint="Optional. Part of the car's name wherever it appears."
          />
          <TextField
            id="car-year"
            label="Model year"
            required
            inputMode="numeric"
            value={values.year}
            onChange={(value) => set("year", value)}
            placeholder="2019"
          />

          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor="car-mileage">Odometer</FieldLabel>
            <div className="flex min-w-0 items-stretch gap-2">
              <input
                id="car-mileage"
                inputMode="numeric"
                value={values.mileage}
                onChange={(event) => set("mileage", event.target.value)}
                placeholder="82000"
                className={cn(FIELD_CLASS, "tm-nums min-w-0 flex-1")}
              />
              <Select
                id="car-mileage-unit"
                label="Odometer unit"
                labelHidden
                value={values.mileage_unit}
                onChange={(value) => set("mileage_unit", value)}
                choices={MILEAGE_UNIT_CHOICES}
                className="w-[92px] shrink-0"
              />
            </div>
            <FieldHint>Leave blank if nobody has read it. Never converted.</FieldHint>
          </div>

          <Select
            id="car-body-type"
            label="Body"
            value={values.body_type}
            onChange={(value) => set("body_type", value)}
            choices={BODY_TYPE_CHOICES}
            placeholder="Not stated"
          />
          <Select
            id="car-fuel"
            label="Fuel"
            value={values.fuel}
            onChange={(value) => set("fuel", value)}
            choices={FUEL_CHOICES}
          />
          <Select
            id="car-transmission"
            label="Transmission"
            value={values.transmission}
            onChange={(value) => set("transmission", value)}
            choices={TRANSMISSION_CHOICES}
          />
          <Select
            id="car-drivetrain"
            label="Drivetrain"
            value={values.drivetrain}
            onChange={(value) => set("drivetrain", value)}
            choices={DRIVETRAIN_CHOICES}
            placeholder="Not stated"
          />
          <TextField
            id="car-colour"
            label="Exterior colour"
            value={values.exterior_colour}
            onChange={(value) => set("exterior_colour", value)}
            placeholder="Celestial Silver"
          />
          <Select
            id="car-origin"
            label="Coming from"
            value={values.origin_country}
            onChange={(value) => set("origin_country", value)}
            choices={ORIGIN_CHOICES}
            hint="Descriptive. It is how a customer knows whether the car is right-hand drive."
          />
          <TextField
            id="car-vin"
            label="VIN"
            value={values.vin}
            onChange={(value) => set("vin", value.toUpperCase())}
            placeholder="5TDZARFH8KS123456"
            className="tm-nums uppercase"
            hint="17 characters, never I, O or Q. One VIN is one vehicle, so a duplicate is refused."
          />
        </div>
      </AdminCard>

      {/* ── The crossing ──────────────────────────────────────────────── */}
      <AdminCard
        index={1}
        title="The crossing"
        blurb="Where the car is between the auction and Tema. The ETA is the one date a customer plans around, so it is worth keeping honest even while it moves."
      >
        <div className="grid min-w-0 gap-4 sm:grid-cols-3">
          <TextField
            id="car-vessel"
            label="Vessel"
            value={values.vessel_name}
            onChange={(value) => set("vessel_name", value)}
            placeholder="Grande Lagos"
          />
          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor="car-sailed">Sailed on</FieldLabel>
            <input
              id="car-sailed"
              type="date"
              value={values.sailed_on}
              onChange={(event) => set("sailed_on", event.target.value)}
              className={cn(FIELD_CLASS, "tm-nums")}
            />
            <FieldHint>No time of day. Nobody knows the hour a ship sails.</FieldHint>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor="car-eta">Arrives at Tema</FieldLabel>
            <input
              id="car-eta"
              type="date"
              value={values.eta_tema}
              onChange={(event) => set("eta_tema", event.target.value)}
              className={cn(FIELD_CLASS, "tm-nums")}
            />
            <FieldHint>Printed on the car&rsquo;s page as &ldquo;Arriving 14 March 2026&rdquo;.</FieldHint>
          </div>
        </div>
      </AdminCard>

      {/* ── The price ─────────────────────────────────────────────────── */}
      <AdminCard
        index={2}
        title="The price"
        blurb="Choose what kind of price this car has before you type one. The three are genuinely different offers, and a customer can only start the conversation the state invites."
      >
        <div className="flex min-w-0 flex-col gap-5">
          <fieldset className="min-w-0">
            <legend className="sr-only">What kind of price this car carries</legend>
            <div
              role="radiogroup"
              aria-label="Price state"
              className="grid min-w-0 gap-2.5 sm:grid-cols-3"
            >
              {PRICE_STATE_CHOICES.map((choice) => {
                const active = values.price_state === choice.value;
                return (
                  <button
                    key={choice.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => choosePriceState(choice.value)}
                    className={cn(
                      "flex min-w-0 flex-col gap-1.5 rounded-[16px] border p-4 text-left transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-tm-coral/40 focus-visible:outline-none",
                      active
                        ? "border-tm-coral/45 bg-tm-pill-bg"
                        : "border-tm-border bg-card hover:bg-tm-paper",
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "inline-flex size-4 shrink-0 items-center justify-center rounded-full border",
                          active ? "border-tm-coral bg-tm-coral text-white" : "border-tm-border",
                        )}
                        aria-hidden
                      >
                        {active ? <CheckIcon className="size-2.5" strokeWidth={3} /> : null}
                      </span>
                      <span
                        className={cn(
                          "text-[13.5px] leading-none font-semibold",
                          active ? "text-tm-coral-strong" : "text-tm-ink",
                        )}
                      >
                        {choice.label}
                      </span>
                    </span>
                    <span className="text-[12px] leading-[1.45] font-medium text-tm-text-2">
                      {choice.blurb}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/*
            The money only exists for two of the three states. It is not merely
            hidden here — `withPriceState` empties the fields when "price on
            request" is chosen, so there is no figure left in state for anything
            to pick up later.
          */}
          {values.price_state === CAR_PRICE_STATES.ON_REQUEST ? (
            <p className="max-w-[70ch] rounded-[14px] bg-tm-paper px-4 py-3 text-[13px] leading-[1.5] font-medium text-tm-text-2">
              <span className="font-semibold text-tm-ink">No figure will appear anywhere.</span>{" "}
              Choosing this clears the amounts below, so nothing stale can reach the page. The
              car&rsquo;s page shows &ldquo;Price on request&rdquo; and an{" "}
              <span className="font-semibold">Ask for the price</span> button, and the request
              lands in the enquiry queue.
            </p>
          ) : (
            <div className="flex min-w-0 flex-col gap-5">
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <MoneyField
                  id="car-price"
                  label={
                    values.price_state === CAR_PRICE_STATES.FIXED
                      ? "Landed price"
                      : "Asking price"
                  }
                  required
                  value={values.price}
                  onChange={(value) => set("price", value)}
                  hint="Landed in Tema, duty and clearing included. That is what the customer is told this figure means."
                />
                <div className="flex min-w-0 flex-col justify-end">
                  <p className="text-[12px] leading-[1.45] font-medium text-tm-text-3">
                    Typed in cedis and stored in pesewas, to the pesewa. Nothing here is
                    rounded.
                  </p>
                </div>
              </div>

              <section className="flex min-w-0 flex-col gap-4 rounded-[16px] border border-tm-hairline bg-tm-paper p-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <h3 className="font-display text-[14px] leading-none font-bold text-tm-ink">
                    What the price is made of
                  </h3>
                  <p className="max-w-[70ch] text-[12.5px] leading-[1.5] font-medium text-tm-text-2">
                    Optional, and all four or none — a breakdown with a line missing reads as
                    though that line is zero. When all four are filled in they must add up to
                    the price above, to the pesewa.
                  </p>
                </div>

                <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <MoneyField
                    id="car-vehicle-price"
                    label="Vehicle"
                    value={values.vehicle_price}
                    onChange={(value) => set("vehicle_price", value)}
                  />
                  <MoneyField
                    id="car-freight"
                    label="Ocean freight and insurance"
                    value={values.freight_insurance}
                    onChange={(value) => set("freight_insurance", value)}
                  />
                  <MoneyField
                    id="car-duty"
                    label="Ghana duty and clearing"
                    value={values.duty_clearing}
                    onChange={(value) => set("duty_clearing", value)}
                  />
                  <MoneyField
                    id="car-fee"
                    label="Tomame fee"
                    value={values.service_fee}
                    onChange={(value) => set("service_fee", value)}
                  />
                </div>

                <BreakdownTally breakdown={breakdown} />
              </section>
            </div>
          )}

          {priceProblem ? (
            <p
              role="status"
              className="rounded-[14px] bg-tm-pill-bg px-4 py-3 text-[13px] leading-[1.5] font-semibold text-tm-coral-strong"
            >
              {priceProblem}
            </p>
          ) : null}
        </div>
      </AdminCard>

      {/* ── The page ──────────────────────────────────────────────────── */}
      <AdminCard
        index={3}
        title="The page"
        blurb="The car's own address on the site, what it says about itself, and where it sits in the list."
      >
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor="car-slug">Link</FieldLabel>
            <div className="flex items-stretch overflow-hidden rounded-[12px] border border-tm-border transition-colors focus-within:border-tm-coral/50 focus-within:ring-2 focus-within:ring-tm-coral/15">
              {/*
                `/app/cars` is the storefront path — already public in
                `lib/supabase/proxy.ts`. Printed rather than linked here, and on
                the publish panel, because the customer screen is not in this
                change and a control pointing at a page that does not exist is
                the exact bug that took the Cars entry out of the admin nav.
              */}
              <span className="flex shrink-0 items-center border-r border-tm-hairline bg-tm-paper px-3 text-[13px] font-medium whitespace-nowrap text-tm-text-3 select-none">
                /app/cars/
              </span>
              <input
                id="car-slug"
                value={values.slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  set("slug", event.target.value.toLowerCase());
                }}
                placeholder="2019-toyota-highlander-xle"
                className="h-10 min-w-0 flex-1 bg-card px-3 text-[14px] text-tm-ink outline-none placeholder:text-tm-text-3"
              />
            </div>
            <FieldHint>
              {editing
                ? "Changing this breaks any link already sent to a customer. The stored value is never recomputed from the car's name for exactly that reason."
                : `Suggested from the car's name until you edit it. This one would be /app/cars/${values.slug || "…"}.`}
            </FieldHint>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor="car-description">Description</FieldLabel>
            <Textarea
              id="car-description"
              value={values.description}
              onChange={(event) => set("description", event.target.value)}
              rows={6}
              maxLength={20_000}
              placeholder={`Anything the specification does not say. Service history, what the pictures do not show, what was replaced. The customer reads this word for word about the ${title}.`}
              className="min-h-[140px] w-full resize-y rounded-[12px] border-tm-border bg-card text-[14px] leading-[1.6] text-tm-ink placeholder:text-tm-text-3 focus-visible:border-tm-coral/50 focus-visible:ring-tm-coral/20"
            />
          </div>

          <div className="max-w-[220px]">
            <TextField
              id="car-sort-order"
              label="Sort order"
              inputMode="numeric"
              value={values.sort_order}
              onChange={(value) => set("sort_order", value)}
              className="tm-nums"
              hint="Lowest first on the site. Ties fall back to newest."
            />
          </div>
        </div>
      </AdminCard>

      {/* ── Save ──────────────────────────────────────────────────────── */}
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-tm-border bg-card/95 px-4 py-3 backdrop-blur-[12px]">
        <p className="min-w-0 max-w-[62ch] text-[12.5px] leading-[1.45] font-medium text-tm-text-2">
          {problem ? (
            <span className="font-semibold text-tm-coral-strong">{problem}</span>
          ) : editing ? (
            dirty ? (
              "Unsaved changes."
            ) : (
              "Everything here is saved."
            )
          ) : (
            "Saved as a draft. Nothing reaches the site until you add a photograph and publish it."
          )}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={editing ? "/admin/cars" : "/admin/cars"}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-tm-border bg-card px-4 text-[13px] font-semibold text-tm-text-2 transition-colors hover:bg-tm-paper"
          >
            <ArrowLeftIcon className="size-4" aria-hidden />
            {editing ? "Back to cars" : "Cancel"}
          </Link>
          <AdminButton
            variant="primary"
            busy={saving}
            disabled={problem !== null || (editing && !dirty)}
            onClick={save}
          >
            {editing ? "Save changes" : "Create the listing"}
          </AdminButton>
        </div>
      </div>
    </div>
  );
}

// ── The running sum ─────────────────────────────────────────────────────────

/**
 * The four components against the headline price, as the admin types.
 *
 * `car_listings_breakdown_sums_to_total` compares INTEGER PESEWAS, so there is
 * no rounding slack to forgive a near miss — and the near miss is almost always
 * one mistyped digit among four six-figure numbers, which is exactly the error a
 * human cannot see by reading the column. Naming the difference in cedis while
 * the field is still under the cursor is the whole job of this strip.
 */
function BreakdownTally({
  breakdown,
}: {
  breakdown: ReturnType<typeof describeBreakdown>;
}) {
  if (breakdown.kind === "empty") {
    return (
      <p className="text-[12.5px] leading-[1.45] font-medium text-tm-text-3">
        No breakdown. The car&rsquo;s page shows the total on its own.
      </p>
    );
  }

  if (breakdown.kind === "unreadable") {
    return (
      <p className="text-[12.5px] leading-[1.45] font-semibold text-tm-coral-strong">
        {breakdown.problem}
      </p>
    );
  }

  if (breakdown.kind === "partial") {
    return (
      <p className="text-[12.5px] leading-[1.45] font-semibold text-tm-amber">
        {breakdown.filled} of 4 filled in. Give all four or none.
      </p>
    );
  }

  const matches = breakdown.difference === 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded-[12px] px-3.5 py-2.5",
        matches ? "bg-tm-green-bg/45" : "bg-tm-pill-bg",
      )}
    >
      <span className="text-[12.5px] leading-none font-semibold text-tm-text-2">
        The four parts come to
      </span>
      <span className="flex min-w-0 flex-wrap items-baseline gap-2">
        <span
          className={cn(
            "tm-nums text-[15px] leading-none font-bold",
            matches ? "text-tm-green-ink" : "text-tm-coral-strong",
          )}
        >
          {formatPesewas(breakdown.sum)}
        </span>
        <span
          className={cn(
            "text-[12.5px] leading-none font-semibold",
            matches ? "text-tm-green-ink" : "text-tm-coral-strong",
          )}
        >
          {breakdown.total === null
            ? "and there is no price above to match"
            : matches
              ? "— matches the price above"
              : `— the price above says ${formatPesewas(breakdown.total)}`}
        </span>
      </span>
    </div>
  );
}

// ── Field shapes ────────────────────────────────────────────────────────────

const FIELD_CLASS =
  "h-10 w-full min-w-0 rounded-[12px] border border-tm-border bg-card px-3 text-[14px] text-tm-ink outline-none transition-colors placeholder:text-tm-text-3 focus:border-tm-coral/50 focus:ring-2 focus:ring-tm-coral/15";

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-[13px] leading-none font-semibold text-tm-ink">
      {children}
    </label>
  );
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] leading-[1.4] font-medium text-tm-text-3">{children}</p>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
  required = false,
  inputMode,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  className?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <FieldLabel htmlFor={id}>
        {label}
        {required ? null : <span className="ml-1.5 font-medium text-tm-text-3">optional</span>}
      </FieldLabel>
      <input
        id={id}
        value={value}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn(FIELD_CLASS, className)}
      />
      {hint ? <FieldHint>{hint}</FieldHint> : null}
    </div>
  );
}

/**
 * A cedi field.
 *
 * `inputMode="decimal"` rather than `type="number"`: a number input silently
 * swallows a thousands separator, scrolls its own value when the wheel passes
 * over it, and hands back a string that has already been through the browser's
 * own parser. `parseCedis` is the only thing that reads these, and it wants what
 * was typed.
 */
function MoneyField({
  id,
  label,
  value,
  onChange,
  hint,
  required = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  required?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <FieldLabel htmlFor={id}>
        {label}
        {required ? null : <span className="ml-1.5 font-medium text-tm-text-3">optional</span>}
      </FieldLabel>
      <div className="flex items-stretch overflow-hidden rounded-[12px] border border-tm-border bg-card transition-colors focus-within:border-tm-coral/50 focus-within:ring-2 focus-within:ring-tm-coral/15">
        <span className="flex shrink-0 items-center border-r border-tm-hairline bg-tm-paper px-2.5 text-[13px] font-semibold text-tm-text-3 select-none">
          GH₵
        </span>
        <input
          id={id}
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="0"
          className="tm-nums h-10 min-w-0 flex-1 bg-card px-3 text-[14px] font-semibold text-tm-ink outline-none placeholder:font-normal placeholder:text-tm-text-3"
        />
      </div>
      {hint ? <FieldHint>{hint}</FieldHint> : null}
    </div>
  );
}

function Select({
  id,
  label,
  labelHidden = false,
  value,
  onChange,
  choices,
  placeholder,
  hint,
  className,
}: {
  id: string;
  label: string;
  labelHidden?: boolean;
  value: string;
  onChange: (value: string) => void;
  choices: readonly Choice[];
  /** The empty option's words. Its absence means the field is required. */
  placeholder?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {labelHidden ? (
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
      ) : (
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
      )}
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(FIELD_CLASS, "cursor-pointer")}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
      {hint ? <FieldHint>{hint}</FieldHint> : null}
    </div>
  );
}
