"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { LogOutIcon } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

type Variant = "navbar" | "other";

export default function LogoutButton({variant= 'navbar', className}: {variant?: Variant, className?: string}) {
    const router = useRouter();

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/");
  };

  return variant==="navbar" ? (
    <DropdownMenuItem onClick={logout} variant={'destructive'}>
      <LogOutIcon />
      Sign Out
    </DropdownMenuItem>
  ): (
    <Button variant="destructive" onClick={logout} className={className}>
      <LogOutIcon className="mr-2" />
      Sign Out
    </Button>
  );
}
