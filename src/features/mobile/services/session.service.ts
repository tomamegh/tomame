import "server-only";

import { cache } from "react";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";

/**
 * The signed-in customer, read once per request: the `/m` layout and the screen inside it share
 * one lookup instead of paying for two round trips to Supabase Auth on every tap.
 */
export const currentUser = cache(getAuthenticatedUser);
