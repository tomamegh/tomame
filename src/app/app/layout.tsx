import DashboardNavbar from "@/components/layout/dashboard-navbar";
import { Footer } from "@/components/layout/main";

export default function AppDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="bg-white min-h-dvh flex flex-col font-sans">
      <DashboardNavbar />
      <div className="flex-1 w-full max-w-7xl mx-auto py-8 md:py-10 px-4 sm:px-6 lg:px-8">
        <div className="w-full h-full rounded-3xl min-h-dvh">{children}</div>
      </div>
      <Footer />
    </main>
  );
}
