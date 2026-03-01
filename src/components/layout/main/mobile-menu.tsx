// "use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  MenuIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavLink = { href: string; label: string };

type Props = {
  links: readonly NavLink[];
  isAuthenticated: boolean;
};

export default function MobileMenu({ links, isAuthenticated }: Props) {
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild className="md:hidden">
          <Button variant="outline" size="icon">
            <MenuIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            {links.map((link) => (
              <DropdownMenuItem key={link.label} asChild>
                <Link href={link.href}>{link.label}</Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          {!isAuthenticated && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem className="p-2 w-full">
                  <Button
                    variant="primary"
                    className="w-full rounded-lg"
                    asChild
                  >
                    <Link href="/auth/signup">Get Started</Link>
                  </Button>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
