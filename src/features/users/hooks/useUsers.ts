"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse, MessageResponse } from "@/types/api";
import { CreateUserSchemaType } from "../schema";
import { User } from "@supabase/supabase-js";

export const userKeys = {
  all: ["users"] as const,
  admin: () => [...userKeys.all, "admin"] as const,
};

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation<ApiSuccessResponse<User>, Error, CreateUserSchemaType>({
    mutationFn: (body) =>
      apiFetch<ApiSuccessResponse<User>>("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.admin() });
    },
  });
}

export function useResetUserPassword() {
  return useMutation<ApiSuccessResponse<MessageResponse>, Error, string>({
    mutationFn: (userId) =>
      apiFetch<ApiSuccessResponse<MessageResponse>>(
        `/api/admin/users/${userId}/reset-password`,
        { method: "POST" },
      ),
  });
}
