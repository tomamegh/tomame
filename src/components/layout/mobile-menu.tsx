"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

type NavLink = { href: string; label: string };

export function MobileMenu({ links }: { links: readonly NavLink[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="md:hidden flex flex-col justify-center items-center w-10 h-10 rounded-xl hover:bg-stone-100 transition-colors"
        aria-label="Toggle menu"
      >
        <span
          className={`block w-5 h-0.5 bg-stone-700 rounded-full transition-all duration-300 ${
            open ? "rotate-45 translate-y-0.75" : ""
          }`}
        />
        <span
          className={`block w-5 h-0.5 bg-stone-700 rounded-full mt-1 transition-all duration-300 ${
            open ? "-rotate-45 -translate-y-0.5" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute top-16 left-0 right-0 md:hidden border-t border-stone-200/40 bg-white fade-in">
          <div className="px-4 py-4 space-y-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`block px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                  pathname === link.href
                    ? "bg-stone-100 text-stone-900"
                    : "text-stone-600 hover:bg-stone-50"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
          <div className="px-4 pb-4 pt-2 border-t border-stone-200/40 flex flex-col gap-2">
            <Link href="/auth/signin" onClick={() => setOpen(false)}>
              <Button variant="ghost" className="w-full">
                Sign In
              </Button>
            </Link>
            <Link href="/auth/signup" onClick={() => setOpen(false)}>
              <Button variant="primary" className="w-full">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
