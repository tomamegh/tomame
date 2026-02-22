import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AuthCodeErrorPage() {
  return (
    <div className="space-y-8 text-center">
      <div className="flex justify-center">
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center">
          <ShieldAlert className="w-8 h-8 text-red-500" />
        </div>
      </div>

      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-stone-800">Link not valid</h1>
        <p className="text-stone-400 max-w-sm mx-auto">
          This link has expired, already been used, or is invalid.
        </p>
      </div>

      <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-700 text-left space-y-1">
        <p className="font-medium">Common reasons</p>
        <ul className="list-disc list-inside space-y-1 text-amber-600">
          <li>The link is older than 1 hour</li>
          <li>You already used this link once</li>
          <li>A newer reset email was sent after this one</li>
          <li>The link was copied incorrectly from the email</li>
        </ul>
      </div>

      <div className="space-y-3">
        <Button variant="primary" size="lg" className="w-full" asChild>
          <Link href="/auth/forgot-password">Request a new link</Link>
        </Button>
        <p className="text-sm text-stone-400">
          Know your password?{" "}
          <Link
            href="/auth/login"
            className="font-semibold text-rose-500 hover:text-amber-600 transition-colors"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
