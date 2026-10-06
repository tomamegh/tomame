"use client";

import { useEffect } from "react";

import { reportClientError } from "@/lib/observability/report-client-error";

/**
 * Noise every site sees and nobody can act on: a browser extension's script,
 * a cross-origin script whose message the browser hides, the benign
 * ResizeObserver warning, and a fetch the customer's own navigation aborted.
 */
export function isIgnorableClientError(message: string, filename?: string | null): boolean {
  if (!message) return true;
  if (/^Script error\.?$/i.test(message)) return true;
  if (/ResizeObserver loop/i.test(message)) return true;
  if (/AbortError|The user aborted a request|signal is aborted/i.test(message)) return true;
  if (filename && /^(chrome|moz|safari|safari-web)-extension:/i.test(filename)) return true;
  // Globals other people's code injects into the page: wallet extensions
  // (window.ethereum), Firefox for iOS (__firefox__), and in-app browsers that
  // call a CONFIG they never defined. None of them exist in our bundle.
  if (/window\.ethereum|__firefox__|Can't find variable: CONFIG\b|CONFIG is not defined/.test(message)) return true;
  return false;
}

/**
 * Uncaught errors and unhandled promise rejections anywhere in the tab.
 *
 * Error boundaries catch what React renders; these catch what it does not (an
 * event handler that throws, a promise nobody awaited). Both go to the same
 * reporter, which throttles and never throws. Renders nothing.
 */
export function ClientErrorListener() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const message = event.error instanceof Error ? event.error.message : event.message;
      if (isIgnorableClientError(message, event.filename)) return;
      reportClientError({ kind: "window", message });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "";
      if (isIgnorableClientError(message)) return;
      // An ApiFetchError nobody caught has already been reported by apiFetch.
      if (reason && typeof reason === "object" && "status" in reason) return;
      reportClientError({ kind: "rejection", message });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
