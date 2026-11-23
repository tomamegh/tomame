async function post<T>(url: string, body: unknown, fallback: string): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(res.error || fallback);
  return (res as { data: T }).data;
}

export function requestEmailCode(email: string) {
  return post<{ message: string }>("/api/auth/email-code", { email }, "We couldn't send a code. Please try again.");
}

export function verifyEmailCode(input: { email: string; code: string }) {
  return post<{ isNew: boolean }>("/api/auth/email-code/verify", input, "We couldn't check that code. Please try again.");
}
