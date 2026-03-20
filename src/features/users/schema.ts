import { z } from "zod";
import { PASSWORD } from "@/config/security";
import { ROLES } from "../auth/types";

const email = z.email("Invalid email address").trim().toLowerCase();

const password = z
  .string()
  .min(
    PASSWORD.minLength,
    `Password must be at least ${PASSWORD.minLength} characters`,
  );

export const promoteUserSchema = z.object({
  userId: z.uuid("Invalid user ID"),
});

export const createUserSchema = z.object({
  email,
  password,
  first_name: z.string("First name is required"),
  last_name: z.string("Last name is required"),
  role: z.string("Role is required"),
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
