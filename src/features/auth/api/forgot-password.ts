import { forgotPasswordSchema, type ForgotPasswordSchema } from "../schema";

export async function forgotPassword(data: ForgotPasswordSchema) {
  const parsed = forgotPasswordSchema.safeParse(data);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Invalid email");
  }

  const response = await fetch("/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: parsed.data.email }),
  });

  const json = await response.json();

  if (!response.ok) {
    throw new Error(json.error || "Request failed");
  }

  return json.data;
}
