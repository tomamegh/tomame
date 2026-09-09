import { Suspense } from "react";
import { LoginForm } from "@/features/auth/components";

export default function LoginPage() {
  // LoginForm reads ?next= via useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
