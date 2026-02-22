"use client";

import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { useResetPassword } from "../hooks";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/form";
import { resetPasswordFormSchema, ResetPasswordFormSchema, resetPasswordSchema } from "../schema";

export default function ResetPasswordForm() {
  const router = useRouter();
  const { mutateAsync, isPending, error } = useResetPassword();

  const form = useForm<ResetPasswordFormSchema>({
    resolver: zodResolver(resetPasswordFormSchema),
  });

  const onSubmit = async (data: ResetPasswordFormSchema) => {
    const parsed = resetPasswordSchema.parse(data);
    console.log(parsed.password)
    await mutateAsync(parsed);
    router.push("/auth/login?reset=success");
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-stone-800">Set new password</h1>
        <p className="text-stone-400 mt-2">
          Choose a strong password for your account.
        </p>
      </div>

      <form id="reset-password-form" className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
            {error.message}
          </div>
        )}

        <FieldGroup>
          <Controller
            name="password"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} aria-disabled={isPending}>
                <FieldLabel
                  htmlFor="reset-password-new"
                  className="text-sm font-medium text-stone-700"
                >
                  New Password
                </FieldLabel>
                <Input
                  {...field}
                  type="password"
                  id="reset-password-new"
                  aria-invalid={fieldState.invalid}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="soft-input"
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

          <Controller
            name="confirmPassword"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} aria-disabled={isPending}>
                <FieldLabel
                  htmlFor="reset-password-confirm"
                  className="text-sm font-medium text-stone-700"
                >
                  Confirm New Password
                </FieldLabel>
                <Input
                  {...field}
                  type="password"
                  id="reset-password-confirm"
                  aria-invalid={fieldState.invalid}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="soft-input"
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
        </FieldGroup>

        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={isPending}
          onClick={form.handleSubmit(onSubmit)}
        >
          {isPending ? "Saving..." : "Reset Password"}
        </Button>
      </form>
    </div>
  );
}
