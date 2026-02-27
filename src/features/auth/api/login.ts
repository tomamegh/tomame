import { loginSchema, LoginSchemaType } from "../schema";

export async function login(data: LoginSchemaType) {
  const parsed = loginSchema.safeParse(data);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Invalid credentials");
  }

  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: parsed.data.email,
      password: parsed.data.password,
    }),
  });

  const res = await response.json();

  if (!response.ok) {
    throw new Error(res.error || "Login failed");
  }

  return res;
}
