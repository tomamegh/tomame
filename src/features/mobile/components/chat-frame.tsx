"use client";

import type { ReactNode } from "react";

import { AppRoutesProvider } from "@/lib/native/app-routes";

/**
 * Buy for me inside the app: the website's own chat (same calls, same cards) in its "app"
 * variant, with its links pointed at `/m` screens. The frame fills the locked screen
 * (`.tm-m.chat-lock` in mobile.css): only the conversation scrolls.
 */
export function ChatFrame({ children }: { children: ReactNode }) {
  return (
    <AppRoutesProvider routes="mobile">
      <div className="chat-frame">{children}</div>
    </AppRoutesProvider>
  );
}
