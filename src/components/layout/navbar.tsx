import Link from "next/link";
import { NavLinks } from "./nav-links";
import { MobileMenu } from "./mobile-menu";
import { Suspense } from "react";
import NavbarAuthButton from "@/features/auth/components/auth-button";
import { createClient } from "@/lib/supabase/server";

const NAV_LINKS = {
  authenticated: [
    { href: "/app", label: "Dashboard", icon: null },
    { href: "/app/orders", label: "My Orders", icon: null },
    { href: "/app/products", label: "My Products", icon: null },
    { href: "/app/notifications", label: "Notifications", icon: null },
  ],
  unauthenticated: [
    { href: "/", label: "Home", icon: null },
    { href: "/about", label: "About", icon: null },
    { href: "/faq", label: "FAQ", icon: null },
    { href: "/contact", label: "Contact", icon: null },
  ],
} as const;

export async function MainNav() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-stone-200/40 shadow-[0_1px_12px_-4px_rgba(120,113,108,0.08)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
        {/* Logo */}
        <Link
          href="/"
          className="font-bold text-xl bg-linear-to-r from-rose-500 to-amber-500 bg-clip-text text-transparent"
        >
          Tomame
        </Link>

        {/* Desktop nav links */}
        <NavLinks links={NAV_LINKS.unauthenticated} />

        {/* Mobile menu */}
        <MobileMenu
          primaryLinks={
            data.user ? NAV_LINKS.authenticated : NAV_LINKS.unauthenticated
          }
          secondaryLinks={NAV_LINKS.unauthenticated}
          user={data.user}
        />

        <Suspense>
          <NavbarAuthButton />
        </Suspense>
      </div>
    </nav>
  );
}
