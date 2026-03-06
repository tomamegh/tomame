import React from "react";
import { AdminNotification, Sidebar } from "@/components/layout/admin"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider className="relative">
      <Sidebar className="bg-white" />
      <SidebarInset>
        <header className="sticky top-0 flex h-16 shrink-0 items-center gap-2 z-999 bg-white shadow-sm shadow-slate-100">
          <div className="flex items-center gap-2 px-4 w-full">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
          <div className="ml-auto">
            <AdminNotification />
          </div>
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-4 p-5 bg-slate-100">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default AdminDashboardLayout;
