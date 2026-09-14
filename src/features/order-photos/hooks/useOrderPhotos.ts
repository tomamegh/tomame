"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/auth/api-helpers";
import type { ApiSuccessResponse } from "@/types/api";
import type { OrderPhotoView } from "../types";

/**
 * The parcel photographs of one order, for the admin screen that takes them.
 *
 * Read from the browser rather than from the server page, for the same reason
 * `useOrderFeedback` is on the customer's side: this is the part of the order
 * screen that changes while an operator is standing in front of it with a phone,
 * and a server-rendered snapshot would be stale the moment they pressed send.
 *
 * Three calls against routes that already exist and are not changed here: the
 * admin list, the multipart upload, and the deletion.
 */

export function orderPhotosQueryKey(orderId: string) {
  return ["orders", orderId, "photos"] as const;
}

/** Every photo on the order, internal ones included. Admin only, by the route. */
export function useAdminOrderPhotos(orderId: string) {
  return useQuery({
    queryKey: orderPhotosQueryKey(orderId),
    queryFn: () =>
      apiFetch<ApiSuccessResponse<{ photos: OrderPhotoView[] }>>(
        `/api/admin/orders/${orderId}/photos`,
      ),
    select: (res) => res.data.photos,
    enabled: !!orderId,
    // A warehouse shelf does not move at browser speed; refetching on every
    // window focus would be noise on a screen an operator leaves open.
    staleTime: 30_000,
  });
}

export interface UploadOrderPhotosInput {
  /** One arrival is usually three pictures, and the customer is told once. */
  files: File[];
  kind: string;
  /** The operator's own words beside the picture. Empty means none. */
  caption: string;
  /** False files the photo internally; the customer never receives it. */
  isCustomerVisible: boolean;
}

/**
 * Send the photographs.
 *
 * MULTIPART, because that is what the route accepts: a base64 body would inflate
 * a 4MB photo to 5.5MB of JSON on the connection that is already the slow part.
 * No `Content-Type` header is set on purpose — the browser has to write the
 * multipart boundary itself, and naming the type by hand loses it.
 */
export function useUploadOrderPhotos(orderId: string) {
  const queryClient = useQueryClient();

  return useMutation<OrderPhotoView[], Error, UploadOrderPhotosInput>({
    mutationFn: async ({ files, kind, caption, isCustomerVisible }) => {
      const form = new FormData();
      for (const file of files) form.append("file", file);
      form.append("kind", kind);
      if (caption.trim()) form.append("caption", caption.trim());
      // Only "false" hides a photo, per the route's own reading of the field.
      form.append("is_customer_visible", isCustomerVisible ? "true" : "false");

      const res = await apiFetch<ApiSuccessResponse<{ photos: OrderPhotoView[] }>>(
        `/api/admin/orders/${orderId}/photos`,
        { method: "POST", body: form },
      );
      return res.data.photos;
    },
    // Settled rather than success: a partial batch is a documented outcome of
    // the service, so the refetch matters most when the write reported a fault.
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: orderPhotosQueryKey(orderId) }),
  });
}

/** Take one picture back down. The row goes, the object goes, the audit row stays. */
export function useDeleteOrderPhoto(orderId: string) {
  const queryClient = useQueryClient();

  return useMutation<OrderPhotoView, Error, string>({
    mutationFn: async (photoId) => {
      const res = await apiFetch<ApiSuccessResponse<{ deleted: OrderPhotoView }>>(
        `/api/admin/orders/${orderId}/photos/${photoId}`,
        { method: "DELETE" },
      );
      return res.data.deleted;
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: orderPhotosQueryKey(orderId) }),
  });
}
