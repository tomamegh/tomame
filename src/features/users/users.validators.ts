import { z } from "zod";
import { PASSWORD } from "@/config/security";

const email = z.email("Invalid email address").trim().toLowerCase();

const password = z
  .string()
  .min(PASSWORD.minLength, `Password must be at least ${PASSWORD.minLength} characters`);

export const promoteUserSchema = z.object({
  userId: z.uuid("Invalid user ID"),
});

export const createAdminSchema = z.object({
  email,
  password,
});

export const adminResetPasswordSchema = z.object({
  email,
});
