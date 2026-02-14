import { z } from "zod";
import { PASSWORD } from "@/config/security";

const email = z.string().email("Invalid email address").trim().toLowerCase();

const password = z
  .string()
  .min(PASSWORD.minLength, `Password must be at least ${PASSWORD.minLength} characters`);

export const signupSchema = z.object({
  email,
  password,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email,
});

export const resetPasswordSchema = z.object({
  password,
});

export const changePasswordSchema = z.object({
  newPassword: password,
});
