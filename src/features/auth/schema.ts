import * as z from "zod";
import { PASSWORD } from "@/config/security";

const email = z.email("Invalid email address").trim().toLowerCase();

const password = z
  .string()
  .min(
    PASSWORD.minLength,
    `Password must be at least ${PASSWORD.minLength} characters`,
  );

export const signupSchema = z.object({
  email,
  password,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
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

export type SignupSchemaType = z.infer<typeof signupSchema>;
export type LoginSchemaType = z.infer<typeof loginSchema>;
export type ForgotPasswordSchema = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordSchema = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordSchema = z.infer<typeof changePasswordSchema>;