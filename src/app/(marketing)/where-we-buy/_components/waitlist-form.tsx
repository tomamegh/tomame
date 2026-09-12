"use client";

import { useId, useState, type FormEvent } from "react";
import { CheckCircle, CircleNotch, WarningCircle } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { MARKETING_FOCUS_RING } from "../../_components/marketing-primitives";

/**
 * Waitlist signup for a lane that is not open yet.
 *
 * `POST /api/waitlist` answers 201 for a new signup, 200 for a repeat and 429
 * when the per-IP limit trips. A repeat is deliberately not an error — the
 * endpoint refuses to reveal who is already on a list — so both 2xx paths land
 * on the same confirmation with slightly different words.
 */

type FormState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string };

interface WaitlistResponse {
  success?: boolean;
  error?: string;
  data?: { status?: "joined" | "already_joined"; regionName?: string };
}

export interface WaitlistFormProps {
  /** `regions.code` — "UK", "CHINA". */
  regionCode: string;
  /** Region name, for the label and the confirmation line. */
  regionName: string;
  className?: string;
}

export function WaitlistForm({
  regionCode,
  regionName,
  className,
}: WaitlistFormProps) {
  const emailId = useId();
  const statusId = useId();
  const [state, setState] = useState<FormState>({ kind: "idle" });

  const submitting = state.kind === "submitting";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const form = event.currentTarget;
    const email = new FormData(form).get("email");
    if (typeof email !== "string" || email.trim().length === 0) {
      setState({ kind: "error", message: "Enter an email address." });
      return;
    }

    setState({ kind: "submitting" });

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), region_code: regionCode }),
      });
      const payload = (await response
        .json()
        .catch(() => ({}))) as WaitlistResponse;

      if (!response.ok) {
        setState({
          kind: "error",
          message:
            response.status === 429
              ? "Too many tries. Give it a minute."
              : (payload.error ?? "Something went wrong. Try again."),
        });
        return;
      }

      form.reset();
      setState({
        kind: "done",
        message:
          payload.data?.status === "already_joined"
            ? `You're already on the ${regionName} list.`
            : `You're on the list. We'll email when ${regionName} opens.`,
      });
    } catch {
      setState({
        kind: "error",
        message: "We couldn't reach the server. Try again.",
      });
    }
  }

  if (state.kind === "done") {
    return (
      <p
        id={statusId}
        role="status"
        aria-live="polite"
        className={cn(
          "tm-up flex items-start gap-2 rounded-xl bg-tm-green-bg px-3.5 py-3",
          "text-[13px] font-medium leading-snug text-tm-green-ink",
          className,
        )}
      >
        <CheckCircle
          weight="fill"
          className="mt-px size-4 shrink-0 text-tm-green"
          aria-hidden="true"
        />
        {state.message}
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={submitting}
      className={cn("flex flex-col gap-2", className)}
    >
      <label htmlFor={emailId} className="sr-only">
        Email address for the {regionName} waitlist
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={emailId}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          disabled={submitting}
          aria-describedby={state.kind === "error" ? statusId : undefined}
          aria-invalid={state.kind === "error" || undefined}
          className={cn(
            "h-11 min-w-0 flex-1 rounded-lg border border-tm-border bg-card px-3.5",
            "text-[14px] text-tm-ink placeholder:text-tm-text-3",
            "disabled:opacity-60",
            MARKETING_FOCUS_RING,
          )}
        />
        <button
          type="submit"
          disabled={submitting}
          className={cn(
            "tm-cta-gradient inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-4",
            "text-[14px] font-bold leading-none",
            "transition-transform duration-300 hover:-translate-y-px",
            "disabled:pointer-events-none disabled:opacity-60",
            MARKETING_FOCUS_RING,
          )}
        >
          {submitting ? (
            <CircleNotch
              weight="bold"
              className="size-4 animate-spin"
              aria-hidden="true"
            />
          ) : null}
          {submitting ? "Joining…" : "Join waitlist"}
        </button>
      </div>

      <p
        id={statusId}
        role="status"
        aria-live="polite"
        className="min-h-4 text-[12px] font-medium leading-none"
      >
        {state.kind === "error" ? (
          <span className="inline-flex items-center gap-1.5 text-tm-coral-strong">
            <WarningCircle
              weight="fill"
              className="size-3.5"
              aria-hidden="true"
            />
            {state.message}
          </span>
        ) : null}
      </p>
    </form>
  );
}
