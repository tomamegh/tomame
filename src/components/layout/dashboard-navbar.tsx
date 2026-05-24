import Link from "next/link";
import { BellIcon, ChevronDownIcon, UserCogIcon, PackageSearchIcon, LayoutGridIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { canAccessAdmin } from "@/features/auth/services";
import LogoutButton from "@/features/auth/components/logout-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DashboardNavLinks } from "./dashboard-nav-links";
import MobileMenu from "@/components/layout/main/mobile-menu";

const MARKETING_LINKS = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
] as const;

export default async function DashboardNavbar() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;
  const isAdmin = user ? canAccessAdmin(user) : false;

  const fullName = user?.user_metadata?.name || user?.email?.split("@")[0] || "Samuel";
  const firstName = fullName.split(" ")[0];
  const initial = firstName.charAt(0).toUpperCase();

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-stone-100 shadow-[0_1px_8px_rgba(0,0,0,0.02)] h-16 w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-full">
        {/* Left Side: Logo */}
        <Link
          href="/"
          className="font-bold text-xl bg-linear-to-r from-rose-500 to-amber-500 bg-clip-text text-transparent"
        >
          Tomame
        </Link>

        {/* Center: Navigation Links */}
        <DashboardNavLinks />

        {/* Right Side: Notification and Profile */}
        <div className="flex items-center gap-4">
          {/* Notification Bell */}
          <button className="relative p-2 text-stone-400 hover:text-stone-700 transition-colors rounded-full hover:bg-stone-50 cursor-pointer">
            <BellIcon className="size-5.5" strokeWidth={1.8} />
            <span className="absolute top-1.5 right-1.5 size-2 bg-red-500 rounded-full border border-white"></span>
          </button>

          {/* User Menu Dropdown — desktop only */}
          <div className="hidden md:block">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 hover:bg-stone-50 py-1.5 pl-1.5 pr-2.5 rounded-full transition-colors cursor-pointer select-none">
                  <Avatar className="size-8 border border-orange-100">
                    <AvatarImage
                      src={user?.user_metadata?.avatar_url || undefined}
                      alt={fullName}
                    />
                    <AvatarFallback className="bg-linear-to-tr from-amber-500 to-[#ff793f] text-white text-xs font-semibold">
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium text-sm text-stone-700 hidden sm:inline-block">
                    {firstName}
                  </span>
                  <ChevronDownIcon className="size-4 text-stone-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 mt-1 rounded-xl shadow-lg border border-stone-100">
                <DropdownMenuGroup>
                  {isAdmin && (
                    <>
                      <DropdownMenuItem asChild>
                        <Link href="/admin" className="flex items-center gap-2 cursor-pointer py-2">
                          <LayoutGridIcon className="size-4 text-stone-500" />
                          <span>Admin Panel</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem asChild>
                    <Link href="/app" className="flex items-center gap-2 cursor-pointer py-2">
                      <LayoutGridIcon className="size-4 text-stone-500" />
                      <span>Dashboard</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/app/orders" className="flex items-center gap-2 cursor-pointer py-2">
                      <PackageSearchIcon className="size-4 text-stone-500" />
                      <span>My Orders</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/app/account" className="flex items-center gap-2 cursor-pointer py-2">
                      <UserCogIcon className="size-4 text-stone-500" />
                      <span>My Account</span>
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <LogoutButton />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Mobile Menu */}
          <MobileMenu links={MARKETING_LINKS} user={user ?? undefined} isAdmin={isAdmin} />
        </div>
      </div>
    </nav>
  );
}
