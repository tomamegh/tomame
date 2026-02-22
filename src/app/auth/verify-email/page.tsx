import { Suspense } from "react";
import VerifyEmail from "@/features/auth/components/verify-email";

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmail />
    </Suspense>
  );
}
