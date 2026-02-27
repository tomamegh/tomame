"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { User } from "@supabase/supabase-js";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type NavLink = { href: string; label: string; icon: LucideIcon | null };

type Props = {
  primaryLinks: readonly NavLink[];
  secondaryLinks: readonly NavLink[];
  user: User | null;
};

export function MobileMenu({
  primaryLinks,
  secondaryLinks,
  user = null,
}: Props) {
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
            open ? "rotate-45 translate-y-1.5" : ""
          }`}
        />
        <span
          className={`block w-5 h-0.5 bg-stone-700 rounded-full mt-1 transition-all duration-300 ${
            open ? "opacity-0" : ""
          }`}
        />
        <span
          className={`block w-5 h-0.5 bg-stone-700 rounded-full mt-1 transition-all duration-300 ${
            open ? "-rotate-45 -translate-y-1.5" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute top-16 left-0 right-0 md:hidden border-t border-stone-200/40 bg-white fade-in shadow-md">
          <div className="px-4 py-4 space-y-1">
            {primaryLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`group flex items-center gap-2 px-4 border-b first:border-none last:border-none nth-[2]:border-t text-sm font-medium transition-colors ${
                  pathname === link.href
                    ? "bg-stone-100 text-stone-900"
                    : "text-stone-600 hover:bg-stone-50"
                } ${user ? "py-2" : "py-3"}`}
              >
                {link.icon && <link.icon className={`${pathname === link.href ? 'stroke-stone-900': 'stroke-stone-600'}`} />}
                {link.label}
              </Link>
            ))}
          </div>
          {!user ? (
            <div className="px-4 py-5 border-t border-stone-200/40 flex gap-2">
              <Link
                href="/auth/login"
                onClick={() => setOpen(false)}
                className="w-full"
              >
                <Button variant="outline" className="w-full">
                  Sign In
                </Button>
              </Link>
              <Link
                href="/auth/signup"
                onClick={() => setOpen(false)}
                className="w-full"
              >
                <Button variant="primary" className="w-full">
                  Get Started
                </Button>
              </Link>
            </div>
          ) : (
            <div className="px-4 py-2 border-t border-stone-200/40 flex flex-wrap gap-5 m-2">
              {secondaryLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="w-fit p-1 text-stone-400 text-sm"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
