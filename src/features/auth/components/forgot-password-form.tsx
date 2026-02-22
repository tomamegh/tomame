"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { forgotPasswordSchema, type ForgotPasswordSchema } from "@/features/auth/schema";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useForgotPassword } from "../hooks";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/form";

export default function ForgotPasswordForm() {
  const [submitted, setSubmitted] = useState(false);
  const { mutateAsync, isPending, error } = useForgotPassword();

  const { control, handleSubmit } = useForm<ForgotPasswordSchema>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordSchema) => {
    await mutateAsync(data);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-stone-800">Check your email</h1>
          <p className="text-stone-400 mt-2">
            If an account exists for that email, we&apos;ve sent a password reset link.
          </p>
        </div>

        <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
          Reset instructions sent — check your inbox and spam folder.
        </div>

        <p className="text-center text-sm text-stone-400">
          <Link
            href="/auth/login"
            className="font-semibold text-rose-500 hover:text-amber-600 transition-colors"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-stone-800">Forgot password?</h1>
        <p className="text-stone-400 mt-2">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>

      <form id="forgot-password-form" className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
            {error.message}
          </div>
        )}

        <FieldGroup>
          <Controller
            name="email"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel
                  htmlFor="forgot-password-email"
                  className="text-sm font-medium text-stone-700"
                >
                  Email
                </FieldLabel>
                <Input
                  {...field}
                  type="email"
                  id="forgot-password-email"
                  aria-invalid={fieldState.invalid}
                  placeholder="you@domain.com"
                  autoComplete="email"
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
          type="button"
          variant="primary"
          size="lg"
          className="w-full"
          disabled={isPending}
          onClick={handleSubmit(onSubmit)}
        >
          {isPending ? "Sending..." : "Send Reset Link"}
        </Button>
      </form>

      <p className="text-center text-sm text-stone-400">
        Remembered it?{" "}
        <Link
          href="/auth/login"
          className="font-semibold text-rose-500 hover:text-amber-600 transition-colors"
        >
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
