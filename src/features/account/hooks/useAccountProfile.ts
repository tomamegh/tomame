"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";
import type { AccountProfile } from "../services/account-profile.service";
import type { UpdateAccountProfileInput } from "../schema";

/**
 * `PATCH /api/app/me` — the one write behind both the Profile tab and the
 * Notifications tab's toggles, because name, phone and the two channel
 * preferences are columns of the same row (051).
 *
 * On success it calls `router.refresh()` rather than invalidating a query key.
 * The account panels are server components: the fresh row has to come from a
 * new server render, and a client-cache invalidation would leave the rendered
 * HTML showing the old value until the next full navigation.
 */
export function useUpdateAccountProfile() {
  const router = useRouter();

  const mutation = useMutation<AccountProfile, Error, UpdateAccountProfileInput>({
    mutationFn: async (input) => {
      const res = await apiFetch<ApiSuccessResponse<{ profile: AccountProfile }>>(
        "/api/app/me",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      return res.data.profile;
    },
  });

  const { mutate } = mutation;

  const save = useCallback(
    (
      input: UpdateAccountProfileInput,
      handlers?: { onSuccess?: (profile: AccountProfile) => void; onError?: (error: Error) => void },
    ) => {
      mutate(input, {
        onSuccess: (profile) => {
          router.refresh();
          handlers?.onSuccess?.(profile);
        },
        onError: (error) => handlers?.onError?.(error),
      });
    },
    [mutate, router],
  );

  return { save, isPending: mutation.isPending };
}
