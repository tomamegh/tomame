"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { emailCodeRequestSchema, loginSchema, type LoginSchemaType } from "@/features/auth/schema";
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
import { Suspense, useState } from "react";
import ResetSuccess from "./reset-success";
import SocialAuthButtons from "./social-auth-button";
import EmailCodeStep from "./email-code-step";
import { useRequestEmailCode } from "../hooks";
import { postAuthDestination, safeInternalPath } from "@/lib/auth/post-auth-destination";
import { canAccessAdmin, isDriver, isWarehouseOnly } from "@/lib/auth/admin-access";
import { createClient } from "@/lib/supabase/client";

/**
 * Sign in. The emailed code is the main way in (Seamless Roadmap, Initiative 1):
 * the same code signs in an existing account or creates a new one, so a
 * first-time customer sent here from Pay never has to invent a password. The
 * password is one tap away for anyone who has one.
 */
export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mutateAsync, error, isPending } = useLogin();
  const requestCode = useRequestEmailCode();
  const rawNext = searchParams.get("next");
  const [mode, setMode] = useState<"code" | "password">("code");
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);

  const { control, handleSubmit, getValues, setError, clearErrors } = useForm<LoginSchemaType>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSendCode = async () => {
    const parsed = emailCodeRequestSchema.safeParse({ email: getValues("email") });
    if (!parsed.success) {
      setError("email", { message: parsed.error.issues[0]?.message ?? "Invalid email address" });
      return;
    }
    clearErrors("email");
    // A refusal is shown from the mutation's `error`.
    if (await requestCode.mutateAsync(parsed.data.email).then(() => true, () => false)) {
      setCodeSentTo(parsed.data.email);
    }
  };

  const onSubmit = async (data: LoginSchemaType) => {
    // A wrong password rejects; the form shows it from the mutation's `error`.
    // Left uncaught it was reported as a site error on every typo.
    const result = await mutateAsync(data).catch(() => null);
    if (!result || result.error) return;

    // Where to land is one shared rule (`postAuthDestination`): an explicit
    // `?next=` wins, otherwise an admin is met with the ADMIN view and everyone
    // else with the storefront. This used to be a hardcoded "/app", so an
    // administrator signing in was dropped into the customer app and had to
    // know to type /admin.
    //
    // THE ROLE COMES FROM THE ACCESS TOKEN, like everywhere else.
    //
    // This read `profile.role` — the database column — while `src/lib/supabase/proxy.ts`
    // gates `/admin` on the JWT claim that `custom_access_token_hook` injects.
    // Two answers to one question: they agree only while the hook has run for
    // that session, and when they disagree the form sends an admin to `/admin`
    // and the proxy immediately returns them to `/app`, which reads as a login
    // that silently refuses. `canAccessAdmin` on the decoded token is the single
    // rule (`lib/auth/admin-access.ts`), and the destination now cannot disagree
    // with the gate it is sending the browser through.
    const { data: claimsData } = await createClient().auth.getClaims();
    const destination = postAuthDestination({
      next: rawNext,
      isAdmin: canAccessAdmin(claimsData?.claims ?? null),
      isWarehouse: isWarehouseOnly(claimsData?.claims ?? null),
      isDriver: isDriver(claimsData?.claims ?? null),
    });

    // `replace`, not `push`: the back button should not return to a login form
    // for a session that now exists.
    router.replace(destination);
    // The shell is server-rendered and still holds the signed-out chrome —
    // without this the nav shows "Sign in" until something else refreshes it.
    router.refresh();
  };

  if (codeSentTo) {
    const next = safeInternalPath(rawNext);
    return (
      <EmailCodeStep
        email={codeSentTo}
        // `/auth/finish` is where Google's button lands too: the new-sign-up
        // alert, then the account's home or the safe `next`. A full navigation,
        // so the server-rendered shell comes back signed in.
        finishUrl={next ? `/auth/finish?next=${encodeURIComponent(next)}` : "/auth/finish"}
        onChangeEmail={() => {
          requestCode.reset();
          setCodeSentTo(null);
        }}
      />
    );
  }

  const shownError = mode === "code" ? requestCode.error : error;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="tm-title-1 text-foreground">Sign in</h1>
        <p className="mt-2 text-muted-foreground">
          {mode === "code"
            ? "We'll email you a code. New to Tomame? The same code creates your account."
            : "Sign in to see your quotes, bag and orders."}
        </p>
      </div>

      <form
        id="signin-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (mode === "code") void onSendCode();
          else void handleSubmit(onSubmit)();
        }}
      >
        <Suspense>
          <ResetSuccess />
        </Suspense>
        {shownError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm mb-4">
            {shownError.message}
          </div>
        )}
        <FieldGroup>
          <SocialAuthButtons />
          <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
            Or continue with email
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
                    autoComplete="email"
                    inputMode="email"
                    className="soft-input"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              );
            }}
          />
          {mode === "password" && (
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
                      autoComplete="current-password"
                      type="password"
                      placeholder="••••••••"
                      className="soft-input"
                      autoFocus
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                );
              }}
            />
          )}
        </FieldGroup>

        {mode === "password" ? (
          <div className="flex justify-end items-center mt-2 mb-5 w-fit ml-auto">
            <Link
              href="/auth/forgot-password"
              className="text-xs text-rose-500 hover:text-amber-600 transition-colors"
            >
              Forgot password?
            </Link>
          </div>
        ) : (
          <div className="mb-5" />
        )}

        {mode === "code" ? (
          <Button variant="primary" size="lg" type="submit" className="w-full" disabled={requestCode.isPending}>
            {requestCode.isPending ? "Sending code…" : "Email me a code"}
          </Button>
        ) : (
          <Button variant="primary" size="lg" type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Signing In..." : "Sign In"}
          </Button>
        )}

        <button
          type="button"
          className="mt-4 block w-full text-center text-sm font-medium text-stone-500 hover:text-foreground transition-colors"
          onClick={() => {
            requestCode.reset();
            clearErrors();
            setMode(mode === "code" ? "password" : "code");
          }}
        >
          {mode === "code" ? "Sign in with a password instead" : "Email me a code instead"}
        </button>
      </form>

      {/* The code creates accounts, so the separate sign-up only matters to password users. */}
      {mode === "password" && (
      <p className="text-center text-sm text-stone-400">
        Don&apos;t have an account?{" "}
        <Link
          // Carry the destination across. A visitor pricing a link who decides
          // to create an account instead of signing in was losing their quote
          // here, the same way the Google button lost it.
          href={rawNext ? `/auth/signup?next=${encodeURIComponent(rawNext)}` : "/auth/signup"}
          className="font-semibold text-rose-500 hover:text-amber-600 transition-colors"
        >
          Create one free
        </Link>
      </p>
      )}
    </div>
  );
}
