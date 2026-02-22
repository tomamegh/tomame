"use client";

import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signupSchema, type SignupSchemaType } from "@/features/auth/schema";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useSignup } from "../hooks";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/form";

export default function SignUpForm() {
  const router = useRouter();
  const { mutateAsync, error, isPending } = useSignup();

  const {
    control,
    handleSubmit,
  } = useForm<SignupSchemaType>({
    resolver: zodResolver(signupSchema),
  });

  const onSubmit = async (data: SignupSchemaType) => {
    await mutateAsync(data);
    router.push(`/auth/verify-email?email=${encodeURIComponent(data.email)}`);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-stone-800">
          Create your account
        </h1>
        <p className="text-stone-400 mt-2">
          Start sourcing products in minutes
        </p>
      </div>

      <form
        id="signup-form"
        className="space-y-5"
      >
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
            {error.message}
          </div>
        )}

        <FieldGroup>
          <Controller
            name="email"
            control={control}
            render={({ field, fieldState }) => {
              return (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel
                    htmlFor="signin-form-email"
                    className="text-sm font-medium text-stone-700"
                  >
                    Email
                  </FieldLabel>
                  <Input
                    {...field}
                    id="signin-form-email"
                    aria-invalid={fieldState.invalid}
                    placeholder="you@domain.com"
                    autoComplete="off"
                    className="soft-input"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              );
            }}
          />
          <Controller
            name="password"
            control={control}
            render={({ field, fieldState }) => {
              return (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel
                    htmlFor="signup-form-password"
                    className="text-sm font-medium text-stone-700"
                  >
                    Password
                  </FieldLabel>
                  <Input
                    {...field}
                    id="signup-form-password"
                    aria-invalid={fieldState.invalid}
                    autoComplete="off"
                    type="password"
                    placeholder="••••••••"
                    className="soft-input"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              );
            }}
          />

          <Controller
            name="confirmPassword"
            control={control}
            render={({ field, fieldState }) => {
              return (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel
                    htmlFor="signup-form-confirm-password"
                    className="text-sm font-medium text-stone-700"
                  >
                    Confirm Password
                  </FieldLabel>
                  <Input
                    {...field}
                    id="signup-form-confirm-password"
                    aria-invalid={fieldState.invalid}
                    autoComplete="off"
                    type="password"
                    placeholder="••••••••"
                    className="soft-input"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              );
            }}
          />
        </FieldGroup>

        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={handleSubmit(onSubmit)}
          disabled={isPending}
          type="button"
        >
          {isPending ? "Creating Account..." : "Create Account"}
        </Button>
      </form>

      <div className="space-y-4">
        <p className="text-center text-sm text-stone-400">
          Already have an account?{" "}
          <Link
            href="/auth/login"
            className="font-semibold text-rose-500 hover:text-amber-600 transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
