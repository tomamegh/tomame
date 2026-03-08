"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeftIcon,
  PackageCheckIcon,
  InfoIcon,
  MinusIcon,
  PlusIcon,
  AlertTriangleIcon,
} from "lucide-react";
import {
  createOrderSchema,
  type CreateOrderSchemaType,
} from "@/features/orders/schema";
import type { ExtractionResult } from "@/features/extraction/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  Field,
  FieldLabel,
  FieldError,
  FieldGroup,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Types ──────────────────────────────────────────────────────────────────

// z.input<> gives the pre-parse type (quantity is optional) matching the resolver
type OrderFormValues = z.input<typeof createOrderSchema>;

interface OrderFormProps {
  extractionData: ExtractionResult;
  productUrl: string;
  isLoading: boolean;
  onSubmit: (data: CreateOrderSchemaType) => void;
  onBack: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildReviewReasons(data: ExtractionResult): string[] {
  const reasons: string[] = [];
  if (!data.extractionSuccess) reasons.push("Automatic extraction failed");
  if (!data.fields.name.value)
    reasons.push("Product name could not be detected");
  if (data.fields.name.confidence === "low")
    reasons.push("Product name extracted with low confidence");
  if (data.fields.price.value === null)
    reasons.push("Price could not be detected");
  if (data.fields.price.confidence === "low")
    reasons.push("Price extracted with low confidence");
  if (!data.fields.country.value)
    reasons.push("Origin country could not be determined");
  return reasons;
}

function parsePriceValue(value: string | number | null): number {
  if (typeof value === "number" && !isNaN(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

export function OrderForm({
  extractionData,
  productUrl,
  isLoading,
  onSubmit,
  onBack,
}: OrderFormProps) {
  const { fields } = extractionData;

  const reviewReasons = buildReviewReasons(extractionData);
  const needsReview = reviewReasons.length > 0;

  const defaultOrigin =
    (fields.country.value as "USA" | "UK" | "CHINA" | null) ?? "USA";

  const {
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<OrderFormValues>({
    resolver: zodResolver(createOrderSchema),
    defaultValues: {
      productUrl,
      productName: (fields.name.value as string | null) ?? "",
      productImageUrl: (fields.image.value as string | null) ?? undefined,
      estimatedPriceUsd: parsePriceValue(fields.price.value),
      quantity: 1,
      originCountry: defaultOrigin,
      specialInstructions: "",
      needsReview,
      reviewReasons,
      // Full extraction result — all fields whether null or not
      extractionMetadata: extractionData,
      // extractionData omitted until migration 010 (ADD COLUMN extraction_data JSONB) is run
    },
  });

  const quantity = watch("quantity") ?? 1;

  return (
    <div className="space-y-4 fade-in">
      {/* Needs review notice */}
      {needsReview && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <div>
            <p className="font-semibold">Admin review required</p>
            <p className="text-amber-700/80 text-xs mt-0.5">
              This order will be reviewed by our team before processing. Please
              fill in any missing details below.
            </p>
          </div>
        </div>
      )}

      {/* Form card */}
      <Card>
        <CardContent className="pt-6">
          <form
            onSubmit={handleSubmit((data) =>
              onSubmit(data as unknown as CreateOrderSchemaType),
            )}
            className="space-y-5"
            noValidate
          >
            <FieldGroup>
              <Controller
                control={control}
                name="productName"
                render={({ field, fieldState }) => {
                  return (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel
                        htmlFor="order-product-name"
                        className="text-sm font-medium text-stone-700"
                      >
                        Product Name{" "}
                        <span className="text-destructive ml-0.5">*</span>
                      </FieldLabel>
                      <Input
                        {...field}
                        id="order-product-name"
                        placeholder="Enter the full product name"
                        className="soft-input"
                        aria-invalid={fieldState.invalid}
                        disabled={isLoading}
                      />
                      {errors.productName && (
                        <FieldError errors={[errors.productName]} />
                      )}
                    </Field>
                  );
                }}
              />

              {/* Price & Country — two columns */}
              <Field className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Estimated Price */}
                <Controller
                  control={control}
                  name="estimatedPriceUsd"
                  render={({ field, fieldState }) => {
                    return (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel
                          htmlFor="order-price"
                          className="text-sm font-medium text-stone-700"
                        >
                          Estimated Price (USD){" "}
                          <span className="text-destructive ml-0.5">*</span>
                        </FieldLabel>
                        <InputGroup className="relative">
                          <InputGroupAddon>$</InputGroupAddon>
                          <InputGroupInput
                            {...field}
                            id="order-price"
                            type="number"
                            step="0.01"
                            min="0.01"
                            max="50000"
                            placeholder="0.00"
                            className="soft-input"
                            aria-invalid={fieldState.invalid}
                            disabled={isLoading}
                          />
                        </InputGroup>
                        {fieldState.error && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    );
                  }}
                />

                {/* Origin Country */}
                <Controller
                  control={control}
                  name="originCountry"
                  render={({ field, fieldState }) => {
                    return (
                      <Field data-invalid={!!errors.originCountry}>
                        <FieldLabel
                          htmlFor="order-country"
                          className="text-sm font-medium text-stone-700"
                        >
                          Origin Country{" "}
                          <span className="text-destructive ml-0.5">*</span>
                        </FieldLabel>
                        <Select
                          name={field.name}
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger
                            id="select-country"
                            aria-invalid={fieldState.invalid}
                          >
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent position="popper">
                            {["CHINA", "UK", "USA"].map((country) => (
                              <SelectItem key={country} value={country}>
                                {country}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {errors.originCountry && (
                          <FieldError errors={[errors.originCountry]} />
                        )}
                      </Field>
                    );
                  }}
                />
              </Field>

              {/* Quantity */}
              <Controller
                control={control}
                name="quantity"
                render={(_props) => {
                  return (
                    <Field>
                      <FieldLabel className="text-sm font-medium text-stone-700">
                        Quantity{" "}
                        <span className="text-xs text-stone-400">
                          (max 100)
                        </span>
                      </FieldLabel>
                      <div className="flex items-center gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          onClick={() =>
                            setValue("quantity", Math.max(1, quantity - 1))
                          }
                          disabled={quantity <= 1 || isLoading}
                          aria-label="Decrease quantity"
                        >
                          <MinusIcon className="size-3.5" />
                        </Button>
                        <span className="w-8 text-center font-semibold text-stone-800 tabular-nums">
                          {quantity}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          onClick={() =>
                            setValue("quantity", Math.min(100, quantity + 1))
                          }
                          disabled={quantity >= 100 || isLoading}
                          aria-label="Increase quantity"
                        >
                          <PlusIcon className="size-3.5" />
                        </Button>
                      </div>
                    </Field>
                  );
                }}
              />

              {/* Special Instructions */}
              <Controller
                control={control}
                name="specialInstructions"
                render={({ field, fieldState }) => {
                  return (
                    <Field aria-invalid={fieldState.invalid}>
                      <FieldLabel
                        htmlFor="order-instructions"
                        className="text-sm font-medium text-stone-700"
                      >
                        Special Instructions
                        <span className="ml-1.5 text-xs font-normal text-stone-400">
                          optional
                        </span>
                      </FieldLabel>
                      <Textarea
                        {...field}
                        id="order-instructions"
                        placeholder="e.g. Preferred colour: black, size: XL — or any specific product variant details"
                        className="soft-input min-h-20 resize-none text-sm"
                        maxLength={2000}
                        disabled={isLoading}
                      />
                    </Field>
                  );
                }}
              />
            </FieldGroup>

            {/* Pricing info note */}
            <div className="flex items-start gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
              <InfoIcon className="mt-0.5 size-4 shrink-0 text-stone-400" />
              <p>
                Final pricing — including shipping and service fee — will be
                calculated after our team reviews your order. Full payment is
                required before processing begins.
              </p>
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-between pt-2 border-t border-stone-100">
              <Button
                type="button"
                variant="outline"
                onClick={onBack}
                disabled={isLoading}
                className="gap-1.5"
              >
                <ArrowLeftIcon className="size-3.5" />
                Back
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={isLoading}
                className="gap-1.5"
              >
                {isLoading ? (
                  <>
                    <Spinner />
                    Submitting...
                  </>
                ) : (
                  <>
                    <PackageCheckIcon className="size-4" />
                    Submit Order
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
