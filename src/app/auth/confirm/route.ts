import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { safeInternalPath } from "@/lib/auth/post-auth-destination";
import { alertIfNewSignup } from "@/features/auth/services/signup-alert";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  // `next` is attacker-controlled (it rides in the emailed link), so only a
  // same-origin path is honoured; anything else falls back to the default.
  const next =
    safeInternalPath(searchParams.get("next")) ?? (type === "recovery" ? "/auth/reset-password" : "/");

  if (token_hash && type) {
    const supabase = await createClient();

    const { data: verified, error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (!error) {
      if (type === "signup" || type === "email") alertIfNewSignup(verified?.user);
      // redirect user to specified redirect URL or root of app
      redirect(next);
    }
  }

  // redirect the user to an error page with some instructions
  redirect("/auth/auth-code-error");
}
