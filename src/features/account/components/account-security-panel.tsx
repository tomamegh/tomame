"use client";

import { useCallback, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Eye, EyeSlash } from "@phosphor-icons/react/ssr";
import { z } from "zod";

import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import { formatNotificationStamp } from "../format";
import { AccountField } from "./account-field";
import { AccountPanel } from "./account-panel";

/**
 * Matches `changePasswordApiSchema` in the route, plus the two rules a server
 * cannot usefully enforce on its own: the confirmation must match what was
 * typed above it, and the new password must differ from the old one. Both are
 * about the form, not about the account, so they live here.
 */
const changePasswordFormSchema = z
  .object({
    current_password: z.string().min(1, "Enter your current password"),
    new_password: z.string().min(6, "New password must be at least 6 characters"),
    confirm_password: z.string().min(1, "Type the new password again"),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "These two do not match",
    path: ["confirm_password"],
  })
  .refine((data) => data.current_password !== data.new_password, {
    message: "Choose a password you have not used here before",
    path: ["new_password"],
  });

type FormState = z.infer<typeof changePasswordFormSchema>;

const EMPTY: FormState = { current_password: "", new_password: "", confirm_password: "" };

export interface AccountSecurityPanelProps {
  blurb: string;
  /** `auth.users.last_sign_in_at` — the real session record, not a guess. */
  lastSignInAt: string | null;
  /** When this account was created, from `auth.users`. */
  createdAt: string | null;
}

/**
 * Security — change the password, and see this account's sign-in record.
 *
 * `POST /api/auth/change-password` is the existing endpoint; Phase 6 made it
 * actually verify the current password before accepting a new one (it used to
 * collect the field and discard it). The form therefore surfaces a 401 against
 * the "current password" field rather than as a generic failure, because that
 * is now a real outcome rather than an impossible one.
 *
 * The two dates below are read from `auth.users` on the server. There is no
 * session list and no device list: Supabase does not expose per-session records
 * to the app, so a "signed-in devices" section would have to be invented. It is
 * left out rather than faked.
 */
export function AccountSecurityPanel({ blurb, lastSignInAt, createdAt }: AccountSecurityPanelProps) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [revealed, setRevealed] = useState(false);

  const changePassword = useMutation<unknown, Error, Omit<FormState, "confirm_password">>({
    mutationFn: (input) =>
      apiFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
  });

  const set = useCallback(<K extends keyof FormState>(key: K, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }, []);

  const onSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const parsed = changePasswordFormSchema.safeParse(form);
      if (!parsed.success) {
        const next: Partial<Record<keyof FormState, string>> = {};
        for (const issue of parsed.error.issues) {
          const field = issue.path[0] as keyof FormState | undefined;
          if (field && !next[field]) next[field] = issue.message;
        }
        setErrors(next);
        return;
      }

      changePassword.mutate(
        {
          current_password: parsed.data.current_password,
          new_password: parsed.data.new_password,
        },
        {
          onSuccess: () => {
            setForm(EMPTY);
            setErrors({});
            toast.success({ title: "Password changed" });
          },
          onError: (error) => {
            // The server's one field-specific rejection. Shown against the field
            // it is about; anything else is a toast, because it is not the
            // customer's typing that went wrong.
            if (/current password/i.test(error.message)) {
              setErrors({ current_password: "That is not your current password" });
              return;
            }
            toast.error({ title: "Could not change your password", description: error.message });
          },
        },
      );
    },
    [changePassword, form],
  );

  const busy = changePassword.isPending;

  return (
    <AccountPanel title="Security" blurb={blurb}>
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <AccountField id="current-password" label="Current password" error={errors.current_password}>
          <Input
            id="current-password"
            type={revealed ? "text" : "password"}
            value={form.current_password}
            onChange={(e) => set("current_password", e.target.value)}
            autoComplete="current-password"
            aria-invalid={!!errors.current_password}
          />
        </AccountField>

        <div className="grid gap-4 sm:grid-cols-2">
          <AccountField
            id="new-password"
            label="New password"
            hint="At least 6 characters."
            error={errors.new_password}
          >
            <Input
              id="new-password"
              type={revealed ? "text" : "password"}
              value={form.new_password}
              onChange={(e) => set("new_password", e.target.value)}
              autoComplete="new-password"
              aria-invalid={!!errors.new_password}
            />
          </AccountField>

          <AccountField id="confirm-password" label="Type it again" error={errors.confirm_password}>
            <Input
              id="confirm-password"
              type={revealed ? "text" : "password"}
              value={form.confirm_password}
              onChange={(e) => set("confirm_password", e.target.value)}
              autoComplete="new-password"
              aria-invalid={!!errors.confirm_password}
            />
          </AccountField>
        </div>

        <button
          type="button"
          onClick={() => setRevealed((prev) => !prev)}
          aria-pressed={revealed}
          className="flex w-fit items-center gap-1.5 text-xs leading-none font-semibold text-tm-text-2 hover:text-tm-ink"
        >
          {revealed ? (
            <EyeSlash weight="duotone" className="size-4" aria-hidden />
          ) : (
            <Eye weight="duotone" className="size-4" aria-hidden />
          )}
          {revealed ? "Hide passwords" : "Show passwords"}
        </button>

        <button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className={cn(
            "tm-cta-gradient mt-1 flex h-[46px] items-center justify-center self-start rounded-xl px-7",
            "text-sm leading-none font-bold shadow-[0_10px_24px_-10px_rgba(244,63,94,.5)]",
            "transition-opacity disabled:opacity-60",
          )}
        >
          {busy ? "Changing…" : "Change password"}
        </button>
      </form>

      <dl className="flex flex-col gap-2 rounded-2xl border border-tm-border bg-tm-paper p-4">
        <Fact label="Last signed in" value={lastSignInAt ? formatNotificationStamp(lastSignInAt) : null} />
        <Fact label="Account created" value={createdAt ? formatNotificationStamp(createdAt) : null} />
      </dl>
    </AccountPanel>
  );
}

/** One dt/dd pair. Omitted entirely when the value is missing — a blank row would read as a zero. */
function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <dt className="text-[13px] leading-none font-medium text-tm-text-2">{label}</dt>
      <dd className="tm-nums text-[13px] leading-none font-semibold">{value}</dd>
    </div>
  );
}
