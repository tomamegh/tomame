"use client";

import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import SupabaseSessionProvider from "@/features/auth/providers/auth-provider";

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes
        refetchOnWindowFocus: false,
      },
    },
  });
}

/**
 * One QueryClient per browser tab, one per SERVER RENDER.
 *
 * This used to be a module-level singleton. On the server a module is loaded
 * once per process, so every request's SSR shared one query cache: the first
 * viewer's `["bag"]` data was rendered into the HTML of every later viewer,
 * cookie or not (found on the bag screen, 2026-09-13). `useState` runs the
 * factory once per component instance — once per request on the server, once
 * per tab in the browser — which is the pattern TanStack documents for SSR.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <SupabaseSessionProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>{children}</TooltipProvider>
      </QueryClientProvider>
    </SupabaseSessionProvider>
  );
}
