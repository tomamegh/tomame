"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLink = { href: string; label: string };

export default function NavLinks({ links }: { links: readonly NavLink[] }) {
  const pathname = usePathname();

  return (
    <div className="hidden md:flex gap-8 items-center">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`text-sm font-medium transition-colors duration-200 ${
            pathname === link.href
              ? "text-stone-900"
              : "text-stone-500 hover:text-stone-900"
          }`}
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}
