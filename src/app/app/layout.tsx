import { Navbar, Footer } from "@/components/layout/main";

export default function AppDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="bg-stone-100 min-h-dvh flex flex-col">
      <Navbar />
      <div className="flex-1 h-full">
        <div className="flex-1 h-full flex items-start max-w-7xl md:max-w-4xl mx-auto py-8 md:py-12 px-4 sm:px-6 md:px-1 justify-center gap-8 overflow-x-hidden">
        {/* <AppSidebar /> */}
        <div className="flex-1 rounded-3xl grow min-h-dvh">{children}</div>
      </div>
      </div>
      <Footer />
    </main>
  );
}
