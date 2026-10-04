import { PlatformRoles } from "@/features/auth/types";
import type { Order } from "@/features/orders/types";
import { User } from "@supabase/supabase-js";

export interface PlatformUser extends User {
  profile: UserProfile;
}

export interface UserProfile {
  id: string;
  first_name?: string;
  last_name?: string;
  role: PlatformRoles;
  bio?: string;
  /** 051. Unverified contact number; required before an order (contact-details.ts). */
  phone?: string | null;
  created_at: Date;
  updated_at: Date;
}

// ── List / stats ──────────────────────────────────────────────────────────────

export interface UserList {
  users: PlatformUser[];
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
  users: PlatformUser[];
  count: number;
  stats: UserStats;
}

export interface UserDetailResponse {
  user: PlatformUser;
  recentOrders: Order[];
}
