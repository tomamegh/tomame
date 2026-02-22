import { signupSchema, SignupSchemaType } from "../schema";

export async function signup(data: SignupSchemaType) {
  const parsed = signupSchema.safeParse(data);

  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message || "Invalid signup data",
    );
  }

  const response = await fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.data),
  });

  const json = await response.json();

  if (!response.ok) {
    throw new Error(json.error || "Signup failed");
  }

  return json.data;
}
