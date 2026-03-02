"use client";

import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth/api-helpers";
import type { OrderResponse } from "@/features/orders/types";

/** Create an order from extracted product data */
export function useCreateOrder() {
    return useMutation<OrderResponse, Error, Record<string, unknown>>({
        mutationFn: (data) =>
            apiFetch("/api/orders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            }),
    });
}
