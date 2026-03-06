"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse, MessageResponse } from "@/types/api";
import type {
  AdminUser,
  UserListResponse,
  UserDetailResponse,
  CreateUserRequest,
  UpdateUserRequest,
} from "../types";

export const userKeys = {
  all: ["users"] as const,
  admin: () => [...userKeys.all, "admin"] as const,
  detail: (id: string) => [...userKeys.all, "detail", id] as const,
};

export function useAdminUsers() {
  return useQuery<ApiSuccessResponse<UserListResponse>, Error, UserListResponse>({
    queryKey: userKeys.admin(),
    queryFn: () =>
      apiFetch<ApiSuccessResponse<UserListResponse>>("/api/admin/users"),
    select: (res) => res.data,
    staleTime: 30_000,
  });
}

export function useAdminUserDetail(id: string) {
  return useQuery<ApiSuccessResponse<UserDetailResponse>, Error, UserDetailResponse>({
    queryKey: userKeys.detail(id),
    queryFn: () =>
      apiFetch<ApiSuccessResponse<UserDetailResponse>>(`/api/admin/users/${id}`),
    select: (res) => res.data,
    staleTime: 30_000,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation<ApiSuccessResponse<AdminUser>, Error, CreateUserRequest>({
    mutationFn: (body) =>
      apiFetch<ApiSuccessResponse<AdminUser>>("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.admin() });
    },
  });
}

export function useUpdateUser(userId: string) {
  const queryClient = useQueryClient();
  return useMutation<ApiSuccessResponse<AdminUser>, Error, UpdateUserRequest>({
    mutationFn: (body) =>
      apiFetch<ApiSuccessResponse<AdminUser>>(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.admin() });
      queryClient.invalidateQueries({ queryKey: userKeys.detail(userId) });
    },
  });
}

export function useResetUserPassword() {
  return useMutation<ApiSuccessResponse<MessageResponse>, Error, string>({
    mutationFn: (userId) =>
      apiFetch<ApiSuccessResponse<MessageResponse>>(
        `/api/admin/users/${userId}/reset-password`,
        { method: "POST" }
      ),
  });
}
