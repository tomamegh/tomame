"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Where shared shopping components link to. The website's paths are the default; the iPhone
 * app (`/m`) wraps its screens in {@link AppRoutesProvider} with {@link MOBILE_ROUTES}, so a
 * component used in both places (the Buy for me chat, the paste panel) keeps the customer
 * inside whichever one they are in.
 */
export interface AppRoutes {
  chat: (id: string) => string;
  run: (id: string) => string;
  newChat: string;
  quote: (extractionCacheId: string) => string;
}

export const WEB_ROUTES: AppRoutes = {
  chat: (id) => `/app/find/chat/${id}`,
  run: (id) => `/app/find/${id}`,
  newChat: "/app/orders/new",
  quote: (id) => `/app/orders/review/${id}`,
};

export const MOBILE_ROUTES: AppRoutes = {
  chat: (id) => `/m/chat/${id}`,
  // A single finder run has no screen of its own in the app yet; the website's opens.
  run: (id) => `/app/find/${id}`,
  newChat: "/m/chat",
  quote: (id) => `/m/product/${id}`,
};

const Ctx = createContext<AppRoutes>(WEB_ROUTES);

export function AppRoutesProvider({ routes, children }: { routes: "web" | "mobile"; children: ReactNode }) {
  return <Ctx.Provider value={routes === "mobile" ? MOBILE_ROUTES : WEB_ROUTES}>{children}</Ctx.Provider>;
}

export const useAppRoutes = (): AppRoutes => useContext(Ctx);
