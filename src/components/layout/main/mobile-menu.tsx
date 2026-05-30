"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MenuIcon,
  X,
  LayoutGridIcon,
  PackageSearchIcon,
  ShieldUserIcon,
  UserCogIcon,
  LogOutIcon,
  UserRoundIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { JwtPayload } from "@supabase/supabase-js";

type NavLink = { href: string; label: string };

type Props = {
  links: readonly NavLink[];
  user?: JwtPayload;
  isAdmin?: boolean;
};

const ACCOUNT_LINKS = [
  { href: "/app", label: "Dashboard", icon: LayoutGridIcon },
  { href: "/app/orders", label: "My Orders", icon: PackageSearchIcon },
  { href: "/app/account", label: "My Account", icon: UserCogIcon },
];

export default function MobileMenu({ links, user, isAdmin }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  };

  return (
    <div className="md:hidden">
      <Drawer direction="right">
        <DrawerTrigger asChild>
          <Button variant="outline" size="icon">
            <MenuIcon className="h-5 w-5" />
          </Button>
        </DrawerTrigger>

        <DrawerContent className="flex flex-col pb-6">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
            <Link
              href="/"
              className="font-bold text-xl bg-linear-to-r from-rose-500 to-amber-500 bg-clip-text text-transparent"
            >
              Tomame
            </Link>
            <DrawerClose asChild>
              <Button variant="ghost" size="icon">
                <X className="h-5 w-5 text-stone-500" />
              </Button>
            </DrawerClose>
          </div>

          {/* Authenticated: user info strip */}
          {user && (
            <div className="flex items-center gap-3 border-b border-stone-100 px-5 py-4">
              <Avatar className="h-9 w-9">
                <AvatarImage
                  src={user.user_metadata?.avatar_url || undefined}
                  alt={user.email}
                />
                <AvatarFallback className="bg-stone-100">
                  <UserRoundIcon className="h-4 w-4 text-stone-500" />
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-stone-800">
                  {user.user_metadata?.full_name || "My Account"}
                </p>
                <p className="truncate text-xs text-stone-400">{user.email}</p>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {/* Nav links */}
            <nav className="flex flex-col px-4 py-3">
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-stone-400">
                Menu
              </p>
              {links.map((link) => (
                <DrawerClose key={link.href} asChild>
                  <Link
                    href={link.href}
                    className={`flex items-center rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
                      pathname === link.href
                        ? "bg-stone-100 text-stone-900"
                        : "text-stone-600 hover:bg-stone-50 hover:text-stone-900"
                    }`}
                  >
                    {link.label}
                  </Link>
                </DrawerClose>
              ))}
            </nav>

            {/* Account links (authenticated) */}
            {user && (
              <nav className="flex flex-col px-4 py-3">
                <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-stone-400">
                  Account
                </p>
                {isAdmin && (
                  <DrawerClose asChild>
                    <Link
                      href="/admin"
                      className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50"
                    >
                      <ShieldUserIcon className="h-4 w-4" />
                      Admin
                    </Link>
                  </DrawerClose>
                )}
                {ACCOUNT_LINKS.map(({ href, label, icon: Icon }) => (
                  <DrawerClose key={href} asChild>
                    <Link
                      href={href}
                      className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
                        pathname === href
                          ? "bg-stone-100 text-stone-900"
                          : "text-stone-600 hover:bg-stone-50 hover:text-stone-900"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </Link>
                  </DrawerClose>
                ))}
              </nav>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-stone-100 px-5 pt-4">
            {user ? (
              <Button
                variant="outline"
                size="lg"
                className="w-full text-stone-600"
                onClick={logout}
              >
                <LogOutIcon className="h-4 w-4" />
                Sign Out
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                <DrawerClose asChild>
                  <Button variant="primary" size="lg" className="w-full" asChild>
                    <Link href="/auth/signup">Start Shopping Free</Link>
                  </Button>
                </DrawerClose>
                <DrawerClose asChild>
                  <Button variant="outline" size="lg" className="w-full" asChild>
                    <Link href="/auth/login">Sign In</Link>
                  </Button>
                </DrawerClose>
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
