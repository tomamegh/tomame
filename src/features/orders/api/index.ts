import { apiFetch } from "@/lib/auth/api-helpers";

export async function getOrders() {
  try {
    return await apiFetch("/api/orders",);
  } catch (error) {
    throw new Error(
      "Failed to fetch orders: " +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}

