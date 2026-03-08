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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/form";
import SocialAuthButtons from "./social-auth-button";

export default function SignUpForm() {
  const router = useRouter();
  const { mutateAsync, error, isPending } = useSignup();

  const { control, handleSubmit } = useForm<SignupSchemaType>({
    resolver: zodResolver(signupSchema),
  });

  const onSubmit = async (data: SignupSchemaType) => {
    await mutateAsync(data);
    router.push(`/auth/verify-email?email=${encodeURIComponent(data.email)}`);
  };

  return (
    <div className={"flex flex-col gap-8 w-full flex-1"}>
      <form id="signup-form" className="space-y-5">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
            {error.message}
          </div>
        )}
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-2xl font-bold">Create your account</h1>
            <p className="text-muted-foreground text-sm text-balance">
              Enter your email below to create your account
            </p>
          </div>
          <Controller
            name="email"
            control={control}
            render={({ field, fieldState }) => {
              return (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel
                    htmlFor="signin-form-email"
                    className="text-stone-900"
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
          <Field>
            <Field className="grid md:grid-cols-2 gap-4">
              <Controller
                name="password"
                control={control}
                render={({ field, fieldState }) => {
                  return (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel
                        htmlFor="signup-form-password"
                        className="text-stone-900"
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
                        className="text-stone-900"
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
            </Field>
            <FieldDescription>
              Must be at least 8 characters long.
            </FieldDescription>
          </Field>
          <Field>
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
          </Field>
          <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card my-3">
            Or continue with
          </FieldSeparator>
          <SocialAuthButtons />
          <FieldDescription className="text-center">
            Already have an account?{" "}
            <Link
              href="/auth/login"
              className="text-rose-500 hover:text-amber-600 transition-colors"
            >
              Sign in
            </Link>
          </FieldDescription>
        </FieldGroup>
      </form>
      <FieldDescription className="px-6 text-center">
        By clicking continue, you agree to our{" "}
        <Link href="#">Terms of Service</Link> and{" "}
        <Link href="#">Privacy Policy</Link>.
      </FieldDescription>
    </div>
  );
}
