"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { useCreateOrder } from "../hooks/useOrders";

const schema = z.object({
  productUrl: z.string().url("Must be a valid URL"),
  productName: z.string().min(2, "Product name is required"),
  productImageUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  estimatedPriceUsd: z.coerce.number().positive("Must be a positive number"),
  quantity: z.coerce.number().int().min(1).default(1),
  originCountry: z.enum(["USA", "UK", "CHINA"]),
  specialInstructions: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface CreateOrderFormProps {
  onSuccess?: () => void;
}

export function CreateOrderForm({ onSuccess }: CreateOrderFormProps) {
  const { mutateAsync, isPending, error } = useCreateOrder();

  const { control, handleSubmit, reset } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { quantity: 1, originCountry: "USA" },
  });

  const onSubmit = async (data: FormValues) => {
    await mutateAsync({
      productUrl: data.productUrl,
      productName: data.productName,
      productImageUrl: data.productImageUrl || undefined,
      estimatedPriceUsd: data.estimatedPriceUsd,
      quantity: data.quantity,
      originCountry: data.originCountry,
      specialInstructions: data.specialInstructions,
    });
    reset();
    onSuccess?.();
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
          {error.message}
        </div>
      )}

      <FieldGroup>
        <Controller
          name="productUrl"
          control={control}
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
          control={control}
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
            name="estimatedPriceUsd"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>Price (USD)</FieldLabel>
                <Input {...field} type="number" min="0" step="0.01" placeholder="298.00" />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />

          <Controller
            name="quantity"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>Quantity</FieldLabel>
                <Input {...field} type="number" min="1" />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </div>

        <Controller
          name="originCountry"
          control={control}
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
          control={control}
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
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel>Special Instructions (optional)</FieldLabel>
              <Textarea {...field} placeholder="Color, size, variant..." rows={3} />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>

      <Button
        type="submit"
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
