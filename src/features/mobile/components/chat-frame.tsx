"use client";

import type { ReactNode } from "react";

import { AppRoutesProvider } from "@/lib/native/app-routes";

/**
 * Buy for me inside the app: the website's own chat (same calls, same cards), with its links
 * pointed at `/m` screens and its padding set for the phone's tab bar.
 */
export function ChatFrame({ children, title = true }: { children: ReactNode; title?: boolean }) {
  return (
    <AppRoutesProvider routes="mobile">
      {title ? (
        <div className="lt" style={{ paddingBottom: 6 }}>
          <div><h1>Buy for me</h1><p>Your buyer for US &amp; UK stores</p></div>
        </div>
      ) : (
        <div style={{ height: 12 }} />
      )}
      <div style={{ padding: "0 14px" }}>{children}</div>
    </AppRoutesProvider>
  );
}
