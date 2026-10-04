"use client";

import { useCallback, useState } from "react";
import { CheckCircle, UserCircle } from "@phosphor-icons/react/ssr";

import { Input } from "@/components/ui/input";
import { AccountField } from "@/features/account/components/account-field";
import { missingContactDetails, type ContactDetails, type ContactField } from "@/features/account/contact-details";
import { useUpdateAccountProfile } from "@/features/account/hooks/useAccountProfile";
import { updateAccountProfileSchema } from "@/features/account/schema";
import { toast } from "@/lib/sonner";

type FormState = Record<ContactField, string>;

const REQUIRED: Record<ContactField, string> = {
  first_name: "Enter your first name",
  last_name: "Enter your last name",
  phone: "Enter a phone number we can reach you on",
};

export interface BagContactCardProps {
  contact: ContactDetails;
  /** Fires with the saved details so the pay button unlocks without waiting on a refresh. */
  onSaved: (contact: ContactDetails) => void;
}

/**
 * "Your details" — name and phone, required before checkout. The server refuses
 * the order without them (`requireContactDetails`); this card is where the
 * customer fills them in without leaving the bag. Saved to the profile through
 * the same `PATCH /api/app/me` the account screen uses.
 */
export function BagContactCard({ contact, onSaved }: BagContactCardProps) {
  const complete = missingContactDetails(contact).length === 0;
  const [editing, setEditing] = useState(!complete);
  const [form, setForm] = useState<FormState>({
    first_name: contact.first_name ?? "",
    last_name: contact.last_name ?? "",
    phone: contact.phone ?? "",
  });
  const [errors, setErrors] = useState<Partial<FormState>>({});
  const { save, isPending } = useUpdateAccountProfile();

  const set = useCallback((key: ContactField, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }, []);

  const onSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const next: Partial<FormState> = {};
      for (const field of missingContactDetails(form)) next[field] = REQUIRED[field];
      const parsed = updateAccountProfileSchema.safeParse(form);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const field = issue.path[0] as ContactField | undefined;
          if (field && !next[field]) next[field] = issue.message;
        }
      }
      if (Object.keys(next).length > 0 || !parsed.success) {
        setErrors(next);
        return;
      }
      save(parsed.data, {
        onSuccess: (profile) => {
          onSaved({ first_name: profile.first_name, last_name: profile.last_name, phone: profile.phone });
          setEditing(false);
        },
        onError: (error) => toast.error({ title: "Could not save your details", description: error.message }),
      });
    },
    [form, onSaved, save],
  );

  return (
    <section
      aria-labelledby="bag-contact"
      className="tm-up flex flex-col gap-3.5 rounded-[24px] border border-tm-border bg-card p-[22px] [animation-delay:0.14s] [animation-duration:0.5s]"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 id="bag-contact" className="font-display text-lg leading-none font-bold">
          Your details
        </h3>
        {complete && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[13px] leading-none font-semibold text-tm-coral hover:underline"
          >
            Edit
          </button>
        )}
      </div>

      {complete && !editing ? (
        <div className="flex items-center gap-3 rounded-2xl border-2 border-tm-coral bg-[#FFF8F5] p-3.5">
          <UserCircle weight="duotone" className="size-5 shrink-0 text-tm-coral" aria-hidden />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate text-sm leading-[1.2] font-semibold">
              {contact.first_name} {contact.last_name}
            </span>
            <span className="text-xs leading-[1.4] text-tm-text-2">{contact.phone}</span>
          </div>
          <CheckCircle weight="fill" className="size-[18px] shrink-0 text-tm-coral" aria-hidden />
        </div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <p className="text-[13px] leading-[1.45] text-tm-text-2">
            We need your name and a phone number before we place your order, so we can reach you about it.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <AccountField id="bag-first-name" label="First name" error={errors.first_name}>
              <Input
                id="bag-first-name"
                value={form.first_name}
                onChange={(e) => set("first_name", e.target.value)}
                autoComplete="given-name"
                required
                aria-invalid={!!errors.first_name}
              />
            </AccountField>
            <AccountField id="bag-last-name" label="Last name" error={errors.last_name}>
              <Input
                id="bag-last-name"
                value={form.last_name}
                onChange={(e) => set("last_name", e.target.value)}
                autoComplete="family-name"
                required
                aria-invalid={!!errors.last_name}
              />
            </AccountField>
          </div>
          <AccountField id="bag-phone" label="Phone" hint="For updates about this order." error={errors.phone}>
            <Input
              id="bag-phone"
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="024 555 0192"
              autoComplete="tel"
              required
              aria-invalid={!!errors.phone}
            />
          </AccountField>
          <button
            type="submit"
            disabled={isPending}
            aria-busy={isPending}
            className="tm-cta-gradient flex h-11 items-center justify-center rounded-[14px] text-sm leading-none font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save details"}
          </button>
        </form>
      )}
    </section>
  );
}
