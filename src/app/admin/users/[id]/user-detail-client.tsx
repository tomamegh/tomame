"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  MailIcon,
  CalendarIcon,
  ShieldIcon,
  KeyRoundIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { UserRoleBadge } from "@/features/users/components/user-role-badge";
import { OrderStatusBadge } from "@/features/orders/components/order-status-badge";
import {
  useAdminUserDetail,
  useUpdateUser,
  useResetUserPassword,
} from "@/features/users/hooks/useUsers";
import type { OrderStatus } from "@/features/orders/types";
import { PlatformRoles } from "@/features/auth/types";

interface Props {
  userId: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatGhs(v: number) {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    minimumFractionDigits: 2,
  }).format(v);
}

export function UserDetailClient({ userId }: Props) {
  const { data, isLoading } = useAdminUserDetail(userId);
  const {mutateAsync: _updateUser, isPending} = useUpdateUser(userId);
  const resetPassword = useResetUserPassword();


  const [role, setRole] = useState<PlatformRoles | null>(null);
  const currentRole = role ?? data?.user.role;


  function handleResetPassword() {
    resetPassword.mutate(userId, {
      onSuccess: () => toast.success("Password reset email sent"),
      onError: (err) => toast.error(err.message),
    });
  }

  return (
    <div className="space-y-8">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="size-8" asChild>
          <Link href="/admin/users">
            <ArrowLeftIcon className="size-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold text-stone-800">User Details</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            {isLoading ? (
              <Skeleton className="h-4 w-48 inline-block" />
            ) : (
              data?.user.email
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: info + edit */}
        <div className="space-y-6 lg:col-span-1">
          {/* User info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Account Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-4 w-full" />
                  ))}
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-stone-600">
                    <MailIcon className="size-4 text-stone-400 shrink-0" />
                    <span className="truncate">{data?.user.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-stone-600">
                    <ShieldIcon className="size-4 text-stone-400 shrink-0" />
                    {data?.user.role && (
                      <UserRoleBadge role={data.user.profile.role} />
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-stone-600">
                    <CalendarIcon className="size-4 text-stone-400 shrink-0" />
                    <span>
                      Joined {data?.user.created_at ? formatDate(data.user.created_at) : "—"}
                    </span>
                  </div>
                  {data?.user.last_sign_in_at && (
                    <div className="flex items-center gap-2 text-stone-500 text-xs">
                      <CalendarIcon className="size-3.5 text-stone-400 shrink-0" />
                      Last seen {formatDate(data.user.last_sign_in_at)}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs bg-stone-100 px-1.5 py-0.5 rounded text-stone-500">
                      #{data?.user.id.slice(0, 8)}
                    </span>
                    {data?.user.email_confirmed_at ? (
                      <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                        Verified
                      </span>
                    ) : (
                      <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                        Unverified
                      </span>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Edit role */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Edit Role</CardTitle>
              <CardDescription>
                Change this user&apos;s access level.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="user-role-select">Role</Label>
                <Select
                  value={currentRole}
                  onValueChange={(v) => setRole(v as "user" | "admin")}
                  disabled={isLoading}
                >
                  <SelectTrigger id="user-role-select" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full"
                disabled={
                  isLoading ||
                  isPending ||
                  currentRole === data?.user.role
                }
              >
                {isPending ? "Saving..." : "Save Changes"}
              </Button>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={handleResetPassword}
                disabled={resetPassword.isPending}
              >
                <KeyRoundIcon className="size-4" />
                {resetPassword.isPending ? "Sending..." : "Reset Password"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right: recent orders */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Orders</CardTitle>
              <CardDescription>Last 10 orders placed by this user.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Product</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right pr-6">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-32">
                        <div className="flex items-center justify-center gap-2 text-stone-400 text-sm">
                          <Spinner className="size-4" />
                          <span>Loading…</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : !data?.recentOrders.length ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center text-stone-400 py-10 text-sm"
                      >
                        No orders yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.recentOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="pl-6">
                          <div className="space-y-0.5">
                            <Link
                              href={`/admin/orders/${order.id}`}
                              className="font-medium text-stone-800 text-sm hover:text-rose-600 hover:underline line-clamp-1 max-w-52 block"
                            >
                              {order.product_name}
                            </Link>
                            <p className="text-xs text-stone-400 font-mono">
                              #{order.id.slice(0, 8)}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <OrderStatusBadge status={order.status as OrderStatus} />
                        </TableCell>
                        <TableCell className="text-right font-medium text-sm text-stone-800">
                          {formatGhs(order.pricing.total_ghs)}
                        </TableCell>
                        <TableCell className="text-right text-sm text-stone-500 pr-6">
                          {formatDate(order.created_at)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
