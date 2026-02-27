import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";

function SocialAuthButtons() {
  const handleGoogleSignin = async () => {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}/auth/callback`,
      },
    });
  };
  return (
    <Field className="grid grid-cols-1 gap-4">
      {/* <Button variant="outline" className="py-2" size={"lg"} type="button">
        <Image
          src={"/icons/Apple_light.svg"}
          alt="Apple Logo"
          width={28}
          height={28}
        />
        <span className="sr-only">Sign up with Apple</span>
      </Button> */}
      <Button variant="outline" className="py-2 gap-3" size={"lg"} type="button" onClick={handleGoogleSignin}>
        <Image
          src={"/icons/google.svg"}
          alt="Google Logo"
          width={25}
          height={25}
        />
        <span className="font-normal">Sign up with Google</span>
      </Button>
      {/* <Button variant="outline" className="py-2" size={"lg"} type="button">
        <Image src={"/icons/meta.svg"} alt="Meta Logo" width={30} height={30} />
        <span className="sr-only">Sign up with Meta</span>
      </Button> */}
    </Field>
  );
}

export default SocialAuthButtons;
