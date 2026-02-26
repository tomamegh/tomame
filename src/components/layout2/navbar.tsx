'use client'
import Link from "next/link";
import { NavLinks } from "./nav-links";
import { MobileMenu } from "./mobile-menu";
import { Suspense, useEffect, useState } from "react";
import NavbarAuthButton from "@/features/auth/components/auth-button";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
] as const;

export function MainNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-stone-200/40 shadow-[0_1px_12px_-4px_rgba(120,113,108,0.08)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
        {/* Logo */}
        <Link
          href="/"
          className="font-bold text-xl text-primary"
        >
          Tomame
        </Link>

        {/* Desktop nav links */}
        <NavLinks links={NAV_LINKS} />

        {/* Mobile menu */}
        <MobileMenu links={NAV_LINKS} />

        {/* <Suspense>
          <NavbarAuthButton />
        </Suspense> */}
      </div>
    </nav>
  );
}
