import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";

function SocialAuthButtons() {
  const handleGoogleSignin = async () => {
    const supabase = createClient()
    const {error: _} = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <Field className="grid grid-cols-1 gap-4">
      <Button variant="outline" className="py-2 gap-3" size={"lg"} type="button" onClick={handleGoogleSignin}>
        <Image
          src={"/icons/google.svg"}
          alt="Google Logo"
          width={25}
          height={25}
        />
        <span className="font-normal">Continue with Google</span>
      </Button>
    </Field>
  );
}

export default SocialAuthButtons;
