"use client";

import { useCallback, useState } from "react";
import { EnvelopeSimple } from "@phosphor-icons/react/ssr";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import { updateAccountProfileSchema } from "../schema";
import { useUpdateAccountProfile } from "../hooks/useAccountProfile";
import type { AccountProfile } from "../services/account-profile.service";
import { AccountPanel } from "./account-panel";
import { AccountField } from "./account-field";

/** The four editable fields, held as strings while typing. */
type FormState = {
  first_name: string;
  last_name: string;
  phone: string;
  bio: string;
};

function initialState(profile: AccountProfile): FormState {
  return {
    first_name: profile.first_name ?? "",
    last_name: profile.last_name ?? "",
    phone: profile.phone ?? "",
    bio: profile.bio ?? "",
  };
}

/**
 * Profile — name, phone, bio, and the sign-in email.
 *
 * The form validates with the SAME zod schema the route runs, so the browser
 * and the server cannot disagree about what a phone number looks like; the
 * server still validates, because a client check is a convenience and never a
 * control.
 *
 * The email is rendered, not edited. Changing a sign-in address is a Supabase
 * Auth flow with its own confirmation mail on both the old and the new address
 * — an editable field here would promise something the Save button does not do.
 */
export function AccountProfilePanel({
  profile,
  blurb,
}: {
  profile: AccountProfile;
  blurb: string;
}) {
  const [form, setForm] = useState<FormState>(() => initialState(profile));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const { save, isPending } = useUpdateAccountProfile();

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }, []);

  const onSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      // Every field is sent, blank included: a blank one means "remove this",
      // and the schema turns "" into null so the column is actually cleared
      // rather than being left at its old value.
      const parsed = updateAccountProfileSchema.safeParse({
        first_name: form.first_name,
        last_name: form.last_name,
        phone: form.phone,
        bio: form.bio,
      });

      if (!parsed.success) {
        const next: Partial<Record<keyof FormState, string>> = {};
        for (const issue of parsed.error.issues) {
          const field = issue.path[0] as keyof FormState | undefined;
          if (field && !next[field]) next[field] = issue.message;
        }
        setErrors(next);
        return;
      }

      save(parsed.data, {
        onSuccess: () => toast.success({ title: "Profile saved" }),
        onError: (error) =>
          toast.error({ title: "Could not save your profile", description: error.message }),
      });
    },
    [form, save],
  );

  return (
    <AccountPanel title="Profile" blurb={blurb}>
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        {/*
          Two columns at EVERY width. A 390px phone fits two 160px name fields
          comfortably, and stacking them was one of the reasons this form ran
          to two screens before it reached its Save button.
        */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <AccountField id="account-first-name" label="First name" error={errors.first_name}>
            <Input
              id="account-first-name"
              value={form.first_name}
              onChange={(e) => set("first_name", e.target.value)}
              autoComplete="given-name"
              aria-invalid={!!errors.first_name}
            />
          </AccountField>
          <AccountField id="account-last-name" label="Last name" error={errors.last_name}>
            <Input
              id="account-last-name"
              value={form.last_name}
              onChange={(e) => set("last_name", e.target.value)}
              autoComplete="family-name"
              aria-invalid={!!errors.last_name}
            />
          </AccountField>
        </div>

        <AccountField
          id="account-phone"
          label="Phone"
          hint="For order updates. WhatsApp messages go here too."
          error={errors.phone}
        >
          <Input
            id="account-phone"
            type="tel"
            inputMode="tel"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="024 555 0192"
            autoComplete="tel"
            aria-invalid={!!errors.phone}
          />
        </AccountField>

        <AccountField id="account-bio" label="About you (optional)" error={errors.bio}>
          <Textarea
            id="account-bio"
            value={form.bio}
            onChange={(e) => set("bio", e.target.value)}
            rows={2}
            maxLength={500}
            aria-invalid={!!errors.bio}
          />
        </AccountField>

        <div className="flex flex-col gap-1.5">
          <Label className="text-[13px] leading-none font-semibold">Email</Label>
          <div className="flex items-center gap-2.5 rounded-xl border border-tm-border bg-tm-paper px-3.5 py-3">
            <EnvelopeSimple weight="duotone" className="size-[18px] shrink-0 text-tm-text-3" aria-hidden />
            <span className="truncate text-sm leading-none font-medium">
              {profile.email ?? "No email on this account"}
            </span>
          </div>
          <p className="text-xs leading-[1.45] font-medium text-tm-text-3">
            You sign in with this address. To change it, message us: it needs a
            confirmation on both the old and the new one.
          </p>
        </div>

        {/*
          On a phone the Save row STICKS just above the tab bar while the form is
          in view, so the button is never two screens below the field being
          edited — Kelvin: "the save changes and some important info are below
          and I have to force scroll past the slider". The negative margins let
          the bar span the card's full width over its padding; from `lg` it is
          an ordinary button at the end of the form.
        */}
        <div
          className={cn(
            "tm-above-tab-bar z-10 -mx-[22px] mt-1 border-t border-tm-hairline bg-card/95 px-[22px] py-3 backdrop-blur-[8px]",
            "sm:-mx-6 sm:px-6 lg:m-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none",
          )}
        >
          <button
            type="submit"
            disabled={isPending}
            aria-busy={isPending}
            className={cn(
              "tm-cta-gradient flex h-[46px] w-full items-center justify-center rounded-xl px-7 lg:w-auto",
              "text-sm leading-none font-bold shadow-[0_10px_24px_-10px_rgba(244,63,94,.5)]",
              "transition-opacity disabled:opacity-60",
            )}
          >
            {isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </AccountPanel>
  );
}
