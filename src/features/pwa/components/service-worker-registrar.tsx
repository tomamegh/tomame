"use client";

import { useEffect } from "react";

/**
 * Registers `/public/sw.js`, and — just as importantly — makes sure it is never
 * running in development.
 *
 * A service worker and Next's dev server are a genuinely bad pair: HMR pushes a
 * new bundle while the worker is still answering with the previous one, and the
 * result looks like a code bug that survives a hard refresh. So this registers
 * only in production, and actively unregisters anything it finds outside it —
 * which is what rescues a developer who once ran a production build on the same
 * `localhost` port and has had that worker installed ever since.
 *
 * Renders nothing. Mounted once, in the root layout.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => registrations.forEach((r) => void r.unregister()))
        .catch(() => undefined);
      return;
    }

    // After load, not during: registration competes with the first render for
    // the same connection, and nothing about it is urgent.
    const register = () => {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // An unregistrable worker costs us the install prompt and the offline
        // page. It must never cost us the page the customer is on.
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
