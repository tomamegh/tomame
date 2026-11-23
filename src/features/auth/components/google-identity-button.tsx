"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { safeInternalPath } from "@/lib/auth/post-auth-destination";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/lib/sonner";

/**
 * Google's own "Continue with Google" button (Google Identity Services).
 *
 * WHY. Through Supabase's redirect, Google's account picker says "to continue
 * to zvrjdwvjtzjmtnrawrta.supabase.co", a stranger's address on a screen that
 * asks for a Google account (Kelvin, 2026-11-23). Here the page asks Google
 * itself, so Google names tomame.ca; the ID token it returns is handed to
 * Supabase (`signInWithIdToken`), which checks it and makes the same session.
 *
 * The nonce: Google signs the SHA-256 of a one-time value into the token and
 * Supabase compares it with the raw value, so a token lifted from elsewhere
 * cannot be replayed here.
 *
 * Anything that stops Google's script from loading (blocked, offline, the
 * origin not yet allowed in Google Cloud) leaves the redirect button in place.
 */

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleId {
  initialize(options: { client_id: string; callback: (r: GoogleCredentialResponse) => void; nonce: string; ux_mode?: "popup"; use_fedcm_for_button?: boolean; itp_support?: boolean }): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleId } };
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function GoogleIdentityButton({ clientId, fallback }: { clientId: string; fallback: ReactNode }) {
  const slot = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [busy, setBusy] = useState(false);

  const onCredential = useCallback(async (raw: string, response: GoogleCredentialResponse) => {
    if (!response.credential) return;
    setBusy(true);
    const { error } = await createClient().auth.signInWithIdToken({ provider: "google", token: response.credential, nonce: raw });
    if (error) {
      setBusy(false);
      toast.error({ title: "Could not sign in with Google", description: error.message });
      return;
    }
    // The server finishes: the new-sign-up alert, and where this account belongs (customer, admin, warehouse).
    const next = safeInternalPath(new URLSearchParams(window.location.search).get("next"));
    window.location.assign(`/auth/finish${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  }, []);

  const render = useCallback(async () => {
    const id = window.google?.accounts?.id;
    if (!id || !slot.current) return setState("failed");
    try {
      const raw = randomNonce();
      id.initialize({ client_id: clientId, nonce: await sha256Hex(raw), callback: (r) => void onCredential(raw, r), ux_mode: "popup", use_fedcm_for_button: true, itp_support: true });
      id.renderButton(slot.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "pill",
        logo_alignment: "center",
        width: Math.min(400, Math.max(200, Math.round(slot.current.getBoundingClientRect().width))),
      });
      setState("ready");
    } catch {
      setState("failed");
    }
  }, [clientId, onCredential]);

  // The script may already be on the page (a client-side navigation back here).
  useEffect(() => {
    if (window.google?.accounts?.id) void render();
  }, [render]);

  if (state === "failed") return <>{fallback}</>;
  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={() => void render()} onError={() => setState("failed")} />
      <div aria-busy={busy || state === "loading"} className="flex min-h-11 w-full justify-center">
        <div ref={slot} className="w-full max-w-[400px] [&>div]:mx-auto" />
      </div>
    </>
  );
}
