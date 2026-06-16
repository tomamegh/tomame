import { Footer } from "@/components/layout/main";
import MainNav from "@/components/layout/main/navbar";

export default function AppDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="bg-stone-100 min-h-dvh flex flex-col font-sans">
      <MainNav />
      <div className="flex-1 w-full max-w-7xl mx-auto py-8 md:py-10 px-4 sm:px-6 lg:px-8">
        {children}
      </div>
      <Footer />
    </main>
  );
}
