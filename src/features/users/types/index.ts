import type { OrderStatus } from "@/features/orders/types";

// ── Domain types ──────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  role: "user" | "admin";
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmed: boolean;
}

export interface UserRecentOrder {
  id: string;
  productName: string;
  status: OrderStatus;
  totalGhs: number;
  createdAt: string;
}

// ── List / stats ──────────────────────────────────────────────────────────────

export interface UserList {
  users: AdminUser[];
  count: number;
}

export interface UserStats {
  total: number;
  admins: number;
  regularUsers: number;
  newThisMonth: number;
}

// ── API response types ────────────────────────────────────────────────────────

export interface UserListResponse {
  users: AdminUser[];
  count: number;
  stats: UserStats;
}

export interface UserDetailResponse {
  user: AdminUser;
  recentOrders: UserRecentOrder[];
}

// ── API request types ─────────────────────────────────────────────────────────

export interface CreateUserRequest {
  email: string;
  password: string;
  role: "user" | "admin";
}

export interface UpdateUserRequest {
  role: "user" | "admin";
}
