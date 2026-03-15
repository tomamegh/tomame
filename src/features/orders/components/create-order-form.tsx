"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { useCreateOrder } from "../hooks/useOrders";
import { createOrderSchema, CreateOrderSchemaType } from "../schema";

interface CreateOrderFormProps {
  onSuccess?: () => void;
}

export function CreateOrderForm({ onSuccess }: CreateOrderFormProps) {
  const { mutateAsync, isPending, error } = useCreateOrder();

  const form = useForm({
    resolver: zodResolver(createOrderSchema),
  });

  const onSubmit = async (data: CreateOrderSchemaType) => {
    await mutateAsync({
      productUrl: data.productUrl,
      productName: data.productName,
      productImageUrl: data.productImageUrl || undefined,
      estimatedPriceUsd: data.estimatedPriceUsd,
      quantity: data.quantity,
      originCountry: data.originCountry,
      specialInstructions: data.specialInstructions,
    });
    form.reset();
    onSuccess?.();
  };

  return (
    <form className="space-y-5">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
          {error.message}
        </div>
      )}

      <FieldGroup>
        <Controller
          name="productUrl"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel>Product URL</FieldLabel>
              <Input {...field} placeholder="https://amazon.com/dp/..." />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          name="productName"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel>Product Name</FieldLabel>
              <Input {...field} placeholder="Sony WH-1000XM5 Headphones" />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <Controller
            control={form.control}
            name="estimatedPriceUsd"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>Price (USD)</FieldLabel>
                <Input
                  {...field}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="298.00"
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

          <Controller
            name="quantity"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>Quantity</FieldLabel>
                <Input {...field} type="number" min="1" />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
        </div>

        <Controller
          name="originCountry"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel>Ship From</FieldLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USA">United States</SelectItem>
                  <SelectItem value="UK">United Kingdom</SelectItem>
                  <SelectItem value="CHINA">China</SelectItem>
                </SelectContent>
              </Select>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          name="productImageUrl"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel>Product Image URL (optional)</FieldLabel>
              <Input {...field} placeholder="https://..." />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          name="specialInstructions"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel>Special Instructions (optional)</FieldLabel>
              <Textarea
                {...field}
                placeholder="Color, size, variant..."
                rows={3}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>

      <Button
        type="button"
        onClick={form.handleSubmit(onSubmit)}
        variant="primary"
        size="lg"
        className="w-full"
        disabled={isPending}
      >
        {isPending ? "Submitting..." : "Submit Order Request"}
      </Button>
    </form>
  );
}
