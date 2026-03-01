import { Navbar, Footer } from "@/components/layout/main";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="relative">
      <Navbar />
      <div className="min-h-screen bg-white">{children}</div>
      <Footer />
    </main>
  );
}
