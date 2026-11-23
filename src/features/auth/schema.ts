import * as z from "zod";
import { PASSWORD } from "@/config/security";

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

export const signupSchema = z
  .object({
    email,
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required"),
});

/** Email-code sign-in (Seamless Roadmap): ask for a code, then enter it. */
export const emailCodeRequestSchema = z.object({
  email,
});

// Digits only; spaces and dashes a mail client or keyboard adds are dropped.
// Supabase's code length is a project setting (6 locally, 8 hosted).
export const emailCodeVerifySchema = z.object({
  email,
  code: z
    .string("Enter the code from the email")
    .transform((v) => v.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^\d{6,10}$/, "Enter the code from the email")),
});

export const forgotPasswordSchema = z.object({
  email,
});

export const resetPasswordSchema = z
  .object({
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export const changePasswordSchema = z
  .object({
    password: password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export const resetPasswordFormSchema = z
  .object({
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export type SignupSchemaType = z.infer<typeof signupSchema>;
export type LoginSchemaType = z.infer<typeof loginSchema>;
export type ForgotPasswordSchema = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordSchema = z.infer<typeof resetPasswordSchema>;
export type ResetPasswordFormSchema = z.infer<typeof resetPasswordFormSchema>;
export type ChangePasswordSchema = z.infer<typeof changePasswordSchema>;
export type EmailCodeRequestSchema = z.infer<typeof emailCodeRequestSchema>;
export type EmailCodeVerifySchema = z.input<typeof emailCodeVerifySchema>;
