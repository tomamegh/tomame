import { resetPasswordSchema, type ResetPasswordSchema } from "../schema";

export async function resetPassword(data: ResetPasswordSchema) {
  const parsed = resetPasswordSchema.safeParse(data);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Invalid input");
  }

  const response = await fetch("/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: parsed.data.password }),
  });

  const json = await response.json();

  if (!response.ok) {
    throw new Error(json.error || "Password reset failed");
  }

  return json.data;
}
