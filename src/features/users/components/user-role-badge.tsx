import { ShieldIcon, UserIcon } from "lucide-react";

import { AdminBadge } from "@/components/layout/admin";
import type { PlatformRoles } from "@/features/auth/types";

import { roleBadge } from "./admin-user-format";

/**
 * A role chip, on the admin kit's tone vocabulary.
 *
 * It was a shadcn `Badge` with a hand-rolled rose/stone palette — a third
 * colour language next to the storefront's and the admin's. `AdminBadge` is the
 * one spelling of a status chip, and `roleBadge` is the one place that decides
 * what a role is called and which tone it gets, so this component now only
 * chooses the glyph.
 *
 * Kept as a named export with the same props because `admin-order-detail.tsx`
 * renders it beside the customer on an order.
 */
export function UserRoleBadge({ role }: { role: PlatformRoles }) {
  const { label, tone } = roleBadge(role);
  const Icon = role === "admin" ? ShieldIcon : UserIcon;

  return (
    <AdminBadge tone={tone}>
      <Icon className="size-3" aria-hidden />
      {label}
    </AdminBadge>
  );
}
