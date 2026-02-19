import { createClient } from "@/lib/supabase/client";
import { SignupSchemaType } from "@/lib/validators/auth";

export async function signup(data: SignupSchemaType) {
  const supabase = createClient();

  const { email, password } = data;
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/app`,
    },
  });

  if (error) throw error;
}
