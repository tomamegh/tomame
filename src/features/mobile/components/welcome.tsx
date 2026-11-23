"use client";

import { useState } from "react";
import { AirplaneTilt, EnvelopeSimple, LockSimple, SealCheck } from "@phosphor-icons/react";

import { apiFetch } from "@/lib/api-client";
import { haptic } from "@/lib/native/bridge";

type Step = "email" | "code" | "password";

/** Only internal `/m` paths are followed after sign-in; anything else lands on Home. */
const safeNext = (next: string | null): string => (next && /^\/m(\/|$|\?)/.test(next) ? next : "/m");

/**
 * Sign in to the app. Email code is the default, the same two calls as the website
 * (`/api/auth/email-code` then `/verify`); a password works too for accounts that have one.
 * Both set the Supabase session cookie server-side, so a full navigation picks it up.
 */
export function Welcome({ next }: { next: string | null }) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      haptic("error");
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const post = (url: string, body: unknown) =>
    apiFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const done = () => {
    haptic("success");
    window.location.assign(safeNext(next));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === "email") {
      void run(async () => {
        await post("/api/auth/email-code", { email: email.trim() });
        haptic("light");
        setStep("code");
      });
    } else if (step === "code") {
      void run(async () => {
        await post("/api/auth/email-code/verify", { email: email.trim(), code });
        done();
      });
    } else {
      void run(async () => {
        await post("/api/auth/login", { email: email.trim(), password });
        done();
      });
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="orbit up">
        <div className="logo">
          <img src="/images/brand/logo-mark.webp" alt="Tomame" />
        </div>
        <span className="tag" style={{ left: 18, top: 34 }}><SealCheck size={16} weight="fill" color="var(--m-green)" />Price in GH₵ first</span>
        <span className="tag" style={{ right: 16, bottom: 40, animationDelay: "-2s" }}><AirplaneTilt size={16} weight="fill" color="var(--m-coral)" />US → Accra</span>
      </div>
      <h1 className="welcome-h up">Shop the US &amp; UK.<br /><em>Pay in cedis.</em></h1>
      <p className="lead up">Paste any link or ask our buyer. See the full price to your door before you pay with MoMo.</p>

      <label className="field">
        <EnvelopeSimple size={20} />
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="Your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={step === "code"}
          required
        />
      </label>
      {step === "code" && (
        <label className="field code">
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="Code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
            autoFocus
            required
            aria-label="The code from the email"
          />
        </label>
      )}
      {step === "password" && (
        <label className="field">
          <LockSimple size={20} />
          <input type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
      )}
      {error && <p className="err" role="alert">{error}</p>}

      <div className="pad" style={{ marginTop: 14 }}>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "One moment…" : step === "email" ? "Email me a code" : "Sign in"}
        </button>
      </div>
      {step === "code" ? (
        <p className="fine">
          We sent a code to {email}.{" "}
          <button type="button" className="link" onClick={() => { setStep("email"); setCode(""); }}>Use another email</button>
        </p>
      ) : (
        <p className="fine">
          <button type="button" className="link" onClick={() => { haptic("light"); setStep(step === "password" ? "email" : "password"); setError(null); }}>
            {step === "password" ? "Email me a code instead" : "Sign in with a password"}
          </button>
        </p>
      )}
      <p className="fine">New here? The code creates your account.</p>
    </form>
  );
}
