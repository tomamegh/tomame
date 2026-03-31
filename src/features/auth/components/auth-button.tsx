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
  ShieldUserIcon,
  UserRoundIcon,
  UserCogIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import LogoutButton from "./logout-button";
import { JwtPayload } from "@supabase/supabase-js";
import { canAccessAdmin } from "../services";

async function NavbarAuthButton({ user }: { user?: JwtPayload }) {
  return user ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild className="max-md:ml-auto">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full border border-neutral-300"
        >
          <Avatar>
            <AvatarImage
              src={user.user_metadata?.avatar_url || undefined}
              alt={user.email}
            />
            <AvatarFallback>
              <UserRoundIcon />
            </AvatarFallback>
          </Avatar>
          {/* <span className="font-normal text-sm">{user.email}</span> */}
          {/* <ChevronDown className="w-4 h-4 opacity-50" /> */}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          {canAccessAdmin(user) && (
            <DropdownMenuGroup>
            <DropdownMenuItem>
              <Link href={"/admin"} className="flex items-center gap-2">
                <ShieldUserIcon className="stroke-stone-800" />
                Admin
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            </DropdownMenuGroup>
          )}
          <DropdownMenuItem>
            <Link href={"/app"} className="flex items-center gap-2">
              <LayoutGridIcon />
              Dashboard
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem>
            <Link href={"/app/account"} className="flex items-center gap-2">
              <UserCogIcon />
              My Account
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Link href={"/app/orders"} className="flex items-center gap-2">
              <PackageSearchIcon />
              My Orders
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Link
              href={"/app/notifications"}
              className="flex items-center gap-2"
            >
              <LayoutGridIcon />
              Notifications
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
        <Button variant="ghost">Sign In</Button>
      </Link>
      <Link href="/auth/signup">
        <Button variant="primary">Get Started</Button>
      </Link>
    </div>
  );
}

export default NavbarAuthButton;
