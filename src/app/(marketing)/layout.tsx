import { MainNav } from "@/components/layout/navbar";
import { SiteFooter } from "@/components/layout/site-footer";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="relative">
      <MainNav />
      <div className="min-h-screen bg-white">{children}</div>
      <SiteFooter />
    </main>
  );
}
