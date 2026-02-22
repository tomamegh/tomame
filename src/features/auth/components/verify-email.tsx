"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function VerifyEmail() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email");

  return (
    <div className="space-y-8 text-center">
      <div className="flex justify-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center">
          <Mail className="w-8 h-8 text-rose-500" />
        </div>
      </div>

      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-stone-800">Check your inbox</h1>
        <p className="text-stone-400">
          We sent a confirmation link to
        </p>
        {email && (
          <p className="font-semibold text-stone-700">{email}</p>
        )}
      </div>

      <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-700 text-left space-y-1">
        <p className="font-medium">Next steps</p>
        <ol className="list-decimal list-inside space-y-1 text-amber-600">
          <li>Open the email from Tomame</li>
          <li>Click the confirmation link</li>
          <li>You'll be signed in automatically</li>
        </ol>
      </div>

      <div className="space-y-3">
        <Button variant="primary" size="lg" className="w-full" asChild>
          <Link href="/auth/login">Go to sign in</Link>
        </Button>
        <p className="text-sm text-stone-400">
          Didn&apos;t receive it? Check your spam folder or{" "}
          <Link
            href="/auth/signup"
            className="font-semibold text-rose-500 hover:text-amber-600 transition-colors"
          >
            try again
          </Link>
        </p>
      </div>
    </div>
  );
}
