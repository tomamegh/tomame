import Link from "next/link";
import NavbarAuthButton from "@/features/auth/components/auth-button";
import { createClient } from "@/lib/supabase/server";
import NavLinks from "./nav-links";
import MobileMenu from "./mobile-menu";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
] as const;

export default async function MainNav() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;
  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-stone-200/40 shadow-[0_1px_12px_-4px_rgba(120,113,108,0.08)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center gap-3 h-16 overflow-hidden">
        {/* Logo */}
        <Link
          href="/"
          className="font-bold text-xl bg-linear-to-r from-rose-500 to-amber-500 bg-clip-text text-transparent"
        >
          Tomame
        </Link>

        {/* Desktop nav links */}
        <NavLinks links={NAV_LINKS} />

        {/* Mobile menu */}
        {/* <Suspense> */}
          <NavbarAuthButton user={user} />
        {/* </Suspense> */}

        {/* <Suspense> */}
          <MobileMenu links={NAV_LINKS} isAuthenticated={!!user} />
        {/* </Suspense> */}
      </div>
    </nav>
  );
}
