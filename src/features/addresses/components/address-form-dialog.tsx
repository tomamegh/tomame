"use client";

import { formatAddressLabel } from "@/features/addresses/format";

import { useCallback, useMemo, useState } from "react";

import type { DeliveryZoneRow } from "@/db/queries/delivery-zones";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateAddress } from "@/features/addresses/hooks/useAddresses";
import { createAddressSchema, type CreateAddressInput } from "@/features/addresses/schema";
import type { DeliveryAddress } from "@/features/addresses/types";
import { formatGhs } from "@/features/marketing/format";
import { ApiFetchError } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";

export interface AddressFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The door zones the address may be charged at — the server's list, never a hard-coded one. */
  zones: DeliveryZoneRow[];
  /** Called with the saved row so the caller can select it on the bag straight away. */
  onCreated: (address: DeliveryAddress) => void;
  /** Called when the POST comes back 401 — the caller sends the viewer to sign in. */
  onUnauthorized: () => void;
}

/** Every text field of `CreateAddressInput`, held as strings while typing. */
type FormState = {
  label: string;
  recipient_name: string;
  phone: string;
  line1: string;
  line2: string;
  area: string;
  city: string;
  region: string;
  delivery_zone_id: string;
  digital_address: string;
  is_default: boolean;
};

const EMPTY: FormState = {
  label: "",
  recipient_name: "",
  phone: "",
  line1: "",
  line2: "",
  area: "",
  city: "",
  region: "",
  delivery_zone_id: "",
  digital_address: "",
  is_default: false,
};

/** "Greater Accra · Free" / "Kumasi · GH₵40.00" — the zone's own name and fee. */
function zoneOptionLabel(zone: DeliveryZoneRow): string {
  return `${zone.name} · ${zone.fee_ghs > 0 ? formatGhs(zone.fee_ghs) : "Free"}`;
}

/** Blank optional fields must not reach the schema as "" — they are absent, not empty. */
function toInput(form: FormState): Record<string, unknown> {
  const optional = (v: string) => (v.trim() === "" ? undefined : v.trim());
  return {
    label: form.label.trim(),
    recipient_name: form.recipient_name.trim(),
    phone: form.phone.trim(),
    line1: form.line1.trim(),
    line2: optional(form.line2),
    area: optional(form.area),
    city: form.city.trim(),
    region: optional(form.region),
    delivery_zone_id: form.delivery_zone_id,
    digital_address: optional(form.digital_address),
    is_default: form.is_default,
  };
}

/**
 * Add a delivery address without leaving the bag. Client-side validation is the
 * same zod schema the route runs, so the two never disagree about what a phone
 * number or a GhanaPost code looks like; the server still validates.
 */
export function AddressFormDialog({ open, onOpenChange, zones, onCreated, onUnauthorized }: AddressFormDialogProps) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const createAddress = useCreateAddress();

  const doorZones = useMemo(() => zones.filter((zone) => zone.kind === "door"), [zones]);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev));
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setForm(EMPTY);
        setErrors({});
      }
      onOpenChange(next);
    },
    [onOpenChange],
  );

  const onSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const parsed = createAddressSchema.safeParse(toInput(form));
      if (!parsed.success) {
        // First issue per field only — a field with three complaints still reads as one.
        const next: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const field = String(issue.path[0] ?? "");
          if (field && !next[field]) next[field] = issue.message;
        }
        setErrors(next);
        return;
      }
      createAddress.mutate(parsed.data as CreateAddressInput, {
        onSuccess: (address) => {
          toast.success({ title: "Address saved", description: formatAddressLabel(address) });
          handleOpenChange(false);
          onCreated(address);
        },
        onError: (error) => {
          if (error instanceof ApiFetchError && error.status === 401) {
            onUnauthorized();
            return;
          }
          toast.error({ title: "Could not save the address", description: error.message });
        },
      });
    },
    [createAddress, form, handleOpenChange, onCreated, onUnauthorized],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="rounded-[24px] border-tm-border sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="font-display text-xl leading-none font-bold">Add an address</DialogTitle>
          <DialogDescription className="text-[13px] leading-[1.5] text-tm-text-2">
            Where the courier knocks, and who they ask for.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-3.5" onSubmit={onSubmit} noValidate>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field id="address-label" label="Name this address" error={errors.label}>
              <Input
                id="address-label"
                value={form.label}
                onChange={(e) => set("label", e.target.value)}
                placeholder="Home"
                autoComplete="off"
                aria-invalid={!!errors.label}
              />
            </Field>
            <Field id="address-recipient" label="Who receives it" error={errors.recipient_name}>
              <Input
                id="address-recipient"
                value={form.recipient_name}
                onChange={(e) => set("recipient_name", e.target.value)}
                autoComplete="name"
                aria-invalid={!!errors.recipient_name}
              />
            </Field>
          </div>

          <Field id="address-phone" label="Phone" error={errors.phone}>
            <Input
              id="address-phone"
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="024 555 0192"
              autoComplete="tel"
              aria-invalid={!!errors.phone}
            />
          </Field>

          <Field id="address-line1" label="Street or house" error={errors.line1}>
            <Input
              id="address-line1"
              value={form.line1}
              onChange={(e) => set("line1", e.target.value)}
              autoComplete="address-line1"
              aria-invalid={!!errors.line1}
            />
          </Field>

          <Field id="address-line2" label="Apartment, floor (optional)" error={errors.line2}>
            <Input
              id="address-line2"
              value={form.line2}
              onChange={(e) => set("line2", e.target.value)}
              autoComplete="address-line2"
              aria-invalid={!!errors.line2}
            />
          </Field>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field id="address-area" label="Area (optional)" error={errors.area}>
              <Input
                id="address-area"
                value={form.area}
                onChange={(e) => set("area", e.target.value)}
                placeholder="East Legon"
                autoComplete="address-level3"
                aria-invalid={!!errors.area}
              />
            </Field>
            <Field id="address-city" label="City" error={errors.city}>
              <Input
                id="address-city"
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                autoComplete="address-level2"
                aria-invalid={!!errors.city}
              />
            </Field>
          </div>

          <Field id="address-zone" label="Delivery zone" error={errors.delivery_zone_id}>
            <Select value={form.delivery_zone_id} onValueChange={(value) => set("delivery_zone_id", value)}>
              <SelectTrigger id="address-zone" className="w-full" aria-invalid={!!errors.delivery_zone_id}>
                <SelectValue placeholder="Choose the zone we deliver to" />
              </SelectTrigger>
              <SelectContent>
                {doorZones.map((zone) => (
                  <SelectItem key={zone.id} value={zone.id}>
                    {zoneOptionLabel(zone)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field id="address-digital" label="GhanaPost GPS (optional)" error={errors.digital_address}>
            <Input
              id="address-digital"
              value={form.digital_address}
              onChange={(e) => set("digital_address", e.target.value)}
              placeholder="GA-183-4310"
              autoComplete="off"
              aria-invalid={!!errors.digital_address}
            />
          </Field>

          <div className="flex items-center gap-2.5">
            <Checkbox
              id="address-default"
              checked={form.is_default}
              onCheckedChange={(checked) => set("is_default", checked === true)}
            />
            <Label htmlFor="address-default" className="text-[13px] leading-none font-medium text-tm-text-2">
              Use this as my default address
            </Label>
          </div>

          <button
            type="submit"
            disabled={createAddress.isPending}
            aria-busy={createAddress.isPending}
            className={cn(
              "tm-cta-gradient mt-1 flex h-[46px] items-center justify-center rounded-xl text-sm leading-none font-bold",
              "shadow-[0_10px_24px_-10px_rgba(244,63,94,.5)] transition-opacity disabled:opacity-60",
            )}
          >
            {createAddress.isPending ? "Saving…" : "Save address"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-[13px] leading-none font-semibold">
        {label}
      </Label>
      {children}
      {error ? (
        <p role="alert" className="text-xs leading-[1.4] font-medium text-tm-coral-strong">
          {error}
        </p>
      ) : null}
    </div>
  );
}
