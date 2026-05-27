import React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutGridIcon,
  PackageSearchIcon,
  UserCogIcon,
  ChevronDownIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import LogoutButton from "./logout-button";
import { JwtPayload } from "@supabase/supabase-js";
import { canAccessAdmin } from "../services";

async function NavbarAuthButton({ user }: { user?: JwtPayload }) {
  const isAdmin = user ? canAccessAdmin(user) : false;

  const fullName = user?.user_metadata?.name || user?.email?.split("@")[0] || "";
  const firstName = fullName.split(" ")[0] || "User";
  const initial = firstName.charAt(0).toUpperCase() || "U";
  return user ? (

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
      <DropdownMenuContent
        align="end"
        className="w-56 mt-1 rounded-xl shadow-lg border border-stone-100"
      >
        <DropdownMenuGroup>
          {isAdmin && (
            <>
              <DropdownMenuItem asChild>
                <Link
                  href="/admin"
                  className="flex items-center gap-2 cursor-pointer py-2"
                >
                  <LayoutGridIcon className="size-4 text-stone-500" />
                  <span>Admin Panel</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem asChild>
            <Link
              href="/app"
              className="flex items-center gap-2 cursor-pointer py-2"
            >
              <LayoutGridIcon className="size-4 text-stone-500" />
              <span>Dashboard</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link
              href="/app/orders"
              className="flex items-center gap-2 cursor-pointer py-2"
            >
              <PackageSearchIcon className="size-4 text-stone-500" />
              <span>My Orders</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link
              href="/app/account"
              className="flex items-center gap-2 cursor-pointer py-2"
            >
              <UserCogIcon className="size-4 text-stone-500" />
              <span>My Account</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <LogoutButton />
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
    <div className="hidden md:flex gap-3">
      <Link href="/auth/login">
        <Button variant="default">Sign In</Button>
      </Link>
      <Link href="/auth/signup">
        <Button variant="primary">Get Started</Button>
      </Link>
    </div>
  );
}

export default NavbarAuthButton;
