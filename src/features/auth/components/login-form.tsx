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
          <Field>
            <Button variant="outline" type="button" size={'lg'}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <path
                  d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
                  fill="currentColor"
                />
              </svg>
              Login with Apple
            </Button>
            <Button variant="outline" type="button" size={'lg'}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <path
                  d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                  fill="currentColor"
                />
              </svg>
              Login with Google
            </Button>
          </Field>
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
