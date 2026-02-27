import { AppSidebar } from "@/features/app/components/sidebar";

import { MainNav } from "@/components/layout/navbar";
import { SiteFooter } from "@/components/layout/site-footer";

export default function AppDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="bg-stone-100 min-h-dvh flex flex-col">
      <MainNav />
      <div className="flex-1 h-full">
        <div className="flex-1 h-full flex items-start max-w-7xl md:max-w-4xl mx-auto py-8 md:py-12 px-4 sm:px-6 md:px-1 justify-center gap-8 overflow-x-hidden">
        {/* <AppSidebar /> */}
        <div className="flex-1 rounded-3xl grow">{children}</div>
      </div>
      </div>
      <SiteFooter />
    </main>
  );
}
