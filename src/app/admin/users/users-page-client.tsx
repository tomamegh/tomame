"use client";

import { UserStatCards } from "@/features/users/components/user-stat-cards";
import { useAdminUsers } from "@/features/users/hooks/useUsers";

export function UsersPageClient() {
  const { data, isLoading } = useAdminUsers();
  return <UserStatCards stats={data?.stats} isLoading={isLoading} />;
}
