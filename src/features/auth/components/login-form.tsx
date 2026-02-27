"use client";

import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginSchemaType } from "@/features/auth/schema";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useLogin } from "../hooks";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/form";
import { Suspense } from "react";
import ResetSuccess from "./reset-success";
import SocialAuthButtons from "./social-auth-button";

export default function LoginForm() {
  const router = useRouter();
  const { mutateAsync, error, isPending } = useLogin();

  const { control, handleSubmit } = useForm<LoginSchemaType>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginSchemaType) => {
    const { error } = await mutateAsync(data);
    console.log(error);
    router.push("/app");
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-stone-800">Welcome back</h1>
        <p className="text-stone-400 mt-2">Sign in to access your dashboard</p>
      </div>

      <form id="signin-form">
        <Suspense>
          <ResetSuccess />
        </Suspense>
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm mb-4">
            {error.message}
          </div>
        )}
        <FieldGroup>
          <SocialAuthButtons />
          <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
            Or continue with
          </FieldSeparator>
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
                    type="email"
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
                    htmlFor="signin-form-password"
                    className="text-sm font-medium text-stone-700"
                  >
                    Password
                  </FieldLabel>
                  <Input
                    {...field}
                    id="signin-form-password"
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

        <div className="flex justify-end items-center mt-2 mb-5 w-fit ml-auto">
          <Link
            href="/auth/forgot-password"
            className="text-xs text-rose-500 hover:text-amber-600 transition-colors"
          >
            Forgot password?
          </Link>
        </div>

        <Button
          variant="primary"
          size="lg"
          type="button"
          className="w-full"
          disabled={isPending}
          onClick={handleSubmit(onSubmit)}
        >
          {isPending ? "Signing In..." : "Sign In"}
        </Button>
      </form>

      <p className="text-center text-sm text-stone-400">
        Don&apos;t have an account?{" "}
        <Link
          href="/auth/signup"
          className="font-semibold text-rose-500 hover:text-amber-600 transition-colors"
        >
          Create one free
        </Link>
      </p>
    </div>
  );
}
