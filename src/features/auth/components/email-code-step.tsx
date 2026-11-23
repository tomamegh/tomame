"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/form";
import { toast } from "@/lib/sonner";

import { useRequestEmailCode, useVerifyEmailCode } from "../hooks";

/** Seconds before "Send a new code" comes back, so a slow inbox is not met with a second code. */
const RESEND_AFTER_S = 30;

/**
 * The second half of email-code sign-in: the code from the email. The code's
 * length is a Supabase setting (8 hosted, 6 locally), so the box takes digits
 * and the server judges them.
 */
export default function EmailCodeStep({
  email,
  finishUrl,
  onChangeEmail,
}: {
  email: string;
  finishUrl: string;
  onChangeEmail: () => void;
}) {
  const [code, setCode] = useState("");
  const [wait, setWait] = useState(RESEND_AFTER_S);
  const [done, setDone] = useState(false);
  const verify = useVerifyEmailCode();
  const resend = useRequestEmailCode();

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const digits = code.replace(/\D/g, "");
  const busy = verify.isPending || done;

  const onVerify = async () => {
    if (digits.length < 6 || busy) return;
    const ok = await verify.mutateAsync({ email, code: digits }).then(() => true, () => false);
    if (!ok) return;
    setDone(true);
    window.location.assign(finishUrl);
  };

  const onResend = async () => {
    verify.reset();
    setCode("");
    const ok = await resend.mutateAsync(email).then(() => true, () => false);
    if (ok) {
      setWait(RESEND_AFTER_S);
      toast.success({ title: "New code sent", description: "Only the newest code works." });
    }
  };

  const error = verify.error ?? resend.error;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="tm-title-1 text-foreground">Check your email</h1>
        <p className="mt-2 text-muted-foreground">
          We sent a sign-in code to{" "}
          <span className="font-semibold text-foreground [overflow-wrap:anywhere]">{email}</span>. It works for 1 hour.
        </p>
      </div>

      <form
        id="email-code-form"
        onSubmit={(e) => {
          e.preventDefault();
          void onVerify();
        }}
      >
        {error && (
          <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm mb-4">
            {error.message}
          </div>
        )}
        <Field>
          <FieldLabel htmlFor="email-code" className="text-sm font-medium text-stone-700">
            Code
          </FieldLabel>
          <Input
            id="email-code"
            data-testid="email-code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^\d\s-]/g, "").slice(0, 14))}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 -]*"
            placeholder="Enter the code"
            autoFocus
            className="soft-input tm-nums text-center text-xl font-semibold tracking-[0.3em] placeholder:text-base placeholder:font-normal placeholder:tracking-normal"
          />
        </Field>

        <Button variant="primary" size="lg" type="submit" className="mt-5 w-full" disabled={busy || digits.length < 6}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <div className="flex items-center justify-between gap-4 text-sm">
        <button type="button" onClick={onChangeEmail} className="font-medium text-stone-500 hover:text-foreground transition-colors">
          Use a different email
        </button>
        <button
          type="button"
          onClick={() => void onResend()}
          disabled={wait > 0 || resend.isPending}
          className="font-semibold text-rose-500 hover:text-amber-600 transition-colors disabled:text-stone-400 disabled:cursor-default"
        >
          {resend.isPending ? "Sending…" : wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
        </button>
      </div>

      <p className="text-center text-xs text-stone-400">Not there? Check spam or promotions. It comes from Tomame.</p>
    </div>
  );
}
