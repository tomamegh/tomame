"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight } from "@phosphor-icons/react/ssr";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProfile } from "@/features/account/hooks/useProfile";
import { formatGhanaPhone, normaliseGhanaPhone } from "@/features/order-delivery/schema";
import { cn } from "@/lib/utils";
import { sourcingContactNameSchema, sourcingContactPhoneSchema } from "../schema";

/** The assisted dialog's field look, so the two "a person will help" forms match. */
const FIELD = cn(
  "h-12 rounded-[14px] border-tm-border bg-card px-3.5 py-3 text-[15px] leading-[1.5] shadow-none",
  "focus-visible:border-tm-border focus-visible:ring-2 focus-visible:ring-tm-coral/20",
  "aria-invalid:border-tm-amber aria-invalid:ring-2 aria-invalid:ring-tm-amber/20",
);

export interface SourcingContact {
  contact_name: string;
  contact_phone: string;
}

export interface SourcingContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  /** Called with the PARSED values: the name tidied, the phone as E.164. */
  onSubmit: (contact: SourcingContact) => void;
}

/** "Kwame Mensah" from a profile whose halves may each be null. */
export function profileFullName(profile: { first_name?: string | null; last_name?: string | null } | null | undefined): string {
  return [profile?.first_name, profile?.last_name].map((part) => part?.trim() ?? "").filter(Boolean).join(" ");
}

/** A profile phone as the field shows it: readable when it is a Ghana number, as typed otherwise. */
export function profilePhoneForField(phone: string | null | undefined): string {
  const raw = phone?.trim() ?? "";
  const e164 = raw ? normaliseGhanaPhone(raw) : null;
  return e164 ? formatGhanaPhone(e164) : raw;
}

/**
 * "Who should our buyer call?" — asked before a sourcing request goes in (097).
 *
 * Signed-in only: the quote screen sends a signed-out visitor to sign in before
 * this opens, because the request needs an account and a dialog filled in before
 * that redirect would be thrown away by it.
 *
 * Prefilled from the profile once it loads, and only into fields the customer
 * has not touched, so a slow `/api/app/me` cannot overwrite what they typed.
 * Either profile value may be null; the schemas read null as empty.
 */
export function SourcingContactDialog({ open, onOpenChange, pending, onSubmit }: SourcingContactDialogProps) {
  const { data: me } = useProfile();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [touched, setTouched] = useState({ name: false, phone: false });
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});

  // A reopened dialog starts without the last attempt's complaints.
  useEffect(() => {
    if (open) setErrors({});
  }, [open]);

  useEffect(() => {
    if (!open || !me) return;
    if (!touched.name) setName(profileFullName(me.profile));
    if (!touched.phone) setPhone(profilePhoneForField(me.profile?.phone));
  }, [open, me, touched.name, touched.phone]);

  const submit = useCallback(() => {
    const parsedName = sourcingContactNameSchema.safeParse(name);
    const parsedPhone = sourcingContactPhoneSchema.safeParse(phone);
    if (!parsedName.success || !parsedPhone.success) {
      setErrors({
        name: parsedName.success ? undefined : parsedName.error.issues[0]?.message,
        phone: parsedPhone.success ? undefined : parsedPhone.error.issues[0]?.message,
      });
      return;
    }
    setErrors({});
    onSubmit({ contact_name: parsedName.data, contact_phone: parsedPhone.data });
  }, [name, phone, onSubmit]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[24px] border-tm-border sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="font-display text-xl leading-tight font-bold">Who should our buyer call?</DialogTitle>
          <DialogDescription className="text-[13px] leading-[1.5] text-tm-text-2">
            A person will price this one for you. Check your name and number so they can reach you if
            anything about the item needs a word.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sourcing-contact-name" className="text-[13px] leading-none font-semibold">
              Full name
            </Label>
            <Input
              id="sourcing-contact-name"
              value={name}
              onChange={(e) => {
                setTouched((t) => ({ ...t, name: true }));
                setName(e.target.value);
              }}
              autoComplete="name"
              maxLength={120}
              placeholder="Kwame Mensah"
              aria-invalid={!!errors.name}
              className={FIELD}
            />
            {errors.name && <p className="text-xs leading-[1.4] font-medium text-tm-amber">{errors.name}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sourcing-contact-phone" className="text-[13px] leading-none font-semibold">
              Phone number
            </Label>
            <Input
              id="sourcing-contact-phone"
              value={phone}
              onChange={(e) => {
                setTouched((t) => ({ ...t, phone: true }));
                setPhone(e.target.value);
              }}
              inputMode="tel"
              autoComplete="tel"
              placeholder="024 412 3456"
              aria-invalid={!!errors.phone}
              className={FIELD}
            />
            {errors.phone && <p className="text-xs leading-[1.4] font-medium text-tm-amber">{errors.phone}</p>}
          </div>

          <button
            type="submit"
            disabled={pending}
            aria-busy={pending}
            className={cn(
              "tm-cta-gradient flex h-12 items-center justify-center gap-2 rounded-[14px] text-[15px] leading-none font-bold text-white",
              "transition-opacity disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {pending ? "Sending…" : "Ask us to source this"}
            {!pending && <ArrowRight weight="bold" className="size-4" aria-hidden />}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
