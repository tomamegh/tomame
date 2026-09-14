import React from "react";

import { AdminNotification, Sidebar } from "@/components/layout/admin";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

/**
 * The admin shell — v2.
 *
 * **No auth check here, deliberately.** `src/proxy.ts` gates `/admin` on the
 * `admin` role (and, since the dashboard-endpoint leak, `/api/admin` too). A
 * second redirect in this layout would duplicate a rule that already has one
 * home, and the two would drift.
 *
 * The palette is the storefront's: `bg-tm-paper` behind the content, white
 * cards, `--tm-border` hairlines. It was `bg-slate-50` with `shadow-slate-100`,
 * which is a different product's grey.
 */
export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider className="relative">
      <Sidebar />
      <SidebarInset className="bg-tm-paper">
        {/*
          `tm-safe-top`: no-op in a browser, reserves the notch inset in the
          installed app, where the status bar is translucent and would otherwise
          be drawn over the sidebar trigger. See globals.css.
        */}
        <header className="tm-safe-top sticky top-0 z-50 flex h-16 shrink-0 items-center gap-2 border-b border-tm-hairline bg-card/92 backdrop-blur-[12px]">
          <div className="flex w-full items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1 text-tm-text-2 hover:bg-tm-hairline hover:text-tm-ink" />
            <Separator
              orientation="vertical"
              className="mr-2 bg-tm-border data-[orientation=vertical]:h-4"
            />
            <div className="ml-auto">
              <AdminNotification />
            </div>
          </div>
        </header>
        {/*
          Capped and centred like every other surface in the product. The admin
          body used to be full-bleed, so a table on a wide monitor ran to 2500px
          and the eye lost the row between the id and the amount.
        */}
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-6 md:px-8">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
