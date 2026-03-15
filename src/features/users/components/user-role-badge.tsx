import { Badge } from "@/components/ui/badge";
import { ShieldIcon, UserIcon } from "lucide-react";

interface UserRoleBadgeProps {
  role: "user" | "admin";
}

export function UserRoleBadge({ role }: UserRoleBadgeProps) {
  if (role === "admin") {
    return (
      <Badge
        variant="outline"
        className="bg-rose-500/10 text-rose-600 border-rose-500/30 gap-1"
      >
        <ShieldIcon className="size-3" />
        Admin
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="bg-stone-100 text-stone-600 border-stone-200 gap-1"
    >
      <UserIcon className="size-3" />
      User
    </Badge>
  );
}
