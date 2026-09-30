import { z } from "zod";
import { PASSWORD } from "@/config/security";
import { ROLES } from "../auth/types";

// Trim BEFORE the format check. `z.email().trim()` checks first and trims
// after (zod 4 runs a schema's checks in order), so "ama@example.com " from a
// phone keyboard's autocomplete was answered "Invalid email address".
const email = z.string("Invalid email address").trim().toLowerCase().pipe(z.email("Invalid email address"));

const password = z
  .string()
  .min(
    PASSWORD.minLength,
    `Password must be at least ${PASSWORD.minLength} characters`,
  );

export const promoteUserSchema = z.object({
  userId: z.uuid("Invalid user ID"),
});

/**
 * `POST /api/admin/users`, for the Add user form AND the route.
 *
 * The route used to carry its own stricter copy (names `.min(1)`, a role enum)
 * while the form checked a bare `z.string()`, so a blank name passed in the
 * browser and came back as a 400 in a toast. One schema, imported by both.
 */
export const CREATABLE_ROLES = ["user", "admin", "warehouse"] as const;

export const createUserSchema = z.object({
  email,
  password,
  first_name: z.string("First name is required").trim().min(1, "First name is required").max(255),
  last_name: z.string("Last name is required").trim().min(1, "Last name is required").max(255),
  role: z.enum(CREATABLE_ROLES, { error: "Choose a role" }),
});

export const updateUserSchema = z.object({
  email,
});

export const adminResetPasswordSchema = z.object({
  email,
});

export const updateUserProfileSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  bio: z.string().optional(),
  role: z.enum(ROLES),
});

export type CreateUserSchemaType = z.infer<typeof createUserSchema>;
export type UpdateUserSchemaType = z.infer<typeof updateUserSchema>;
export type UpdateProfileSchemaType = z.infer<typeof updateUserProfileSchema>;
