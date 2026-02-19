import { AppSidebar } from "@/features/app/components/sidebar";

import { MainNav } from "@/components/layout/navbar";
import { SiteFooter } from "@/components/layout/site-footer";

export default function AppDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="bg-slate-100 min-h-dvh flex flex-col">
      <MainNav />
      <div className="flex-1 h-full">
        <div className="flex-1 h-full flex items-start max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 justify-center gap-8">
        <AppSidebar />
        <div className="flex-1 px-8 py-3 rounded-3xl grow">{children}</div>
      </div>
      </div>
      <SiteFooter />
    </main>
  );
}
