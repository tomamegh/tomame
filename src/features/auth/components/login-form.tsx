"use client";

import { useRouter, useSearchParams } from "next/navigation";
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
import { postAuthDestination } from "@/lib/auth/post-auth-destination";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mutateAsync, error, isPending } = useLogin();
  const rawNext = searchParams.get("next");

  const { control, handleSubmit } = useForm<LoginSchemaType>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginSchemaType) => {
    const result = await mutateAsync(data);
    if (result?.error) return;

    // Where to land is one shared rule (`postAuthDestination`): an explicit
    // `?next=` wins, otherwise an admin is met with the ADMIN view and everyone
    // else with the storefront. This used to be a hardcoded "/app", so an
    // administrator signing in was dropped into the customer app and had to
    // know to type /admin.
    //
    // The role comes from the freshly-signed-in user the server just returned,
    // not from anything the browser held beforehand.
    const user = result?.data as { profile?: { role?: string } } | undefined;
    const destination = postAuthDestination({
      next: rawNext,
      isAdmin: user?.profile?.role === "admin",
    });

    // `replace`, not `push`: the back button should not return to a login form
    // for a session that now exists.
    router.replace(destination);
    // The shell is server-rendered and still holds the signed-out chrome —
    // without this the nav shows "Sign in" until something else refreshes it.
    router.refresh();
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
