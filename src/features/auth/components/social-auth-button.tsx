import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { safeInternalPath } from "@/lib/auth/post-auth-destination";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/lib/sonner";
import Image from "next/image";

/**
 * "Continue with Google", on both the sign-in and the create-account screens.
 *
 * WHERE THE CUSTOMER COMES BACK TO. This used to hand Supabase a bare
 * `/auth/callback`, throwing away the `?next=` the quote flow had put in the
 * URL. The callback route honours `next` and always has; nothing was ever
 * sending it one. So a visitor who pasted a link, priced it, was asked to sign
 * in at checkout and chose Google came back to the storefront home with their
 * quote nowhere in sight, and had to paste the link again. Email and password
 * did not have this problem, which is why it went unnoticed: it only bit the
 * customers who use the button most, since the accounts on this platform are
 * gmail and yahoo addresses.
 *
 * The destination is read from the live URL inside the handler rather than
 * through `useSearchParams`, deliberately: this component renders on
 * `/auth/login` and `/auth/signup`, both of which are prerendered, and a
 * search-param hook in a prerendered tree needs a Suspense boundary around
 * every caller. A click handler already runs in the browser, where
 * `window.location` is simply the truth.
 *
 * `safeInternalPath` is the same guard the form and the callback use: a
 * same-origin path only, so a crafted `next` cannot bounce a freshly
 * authenticated browser off the site.
 */
function SocialAuthButtons() {
  const handleGoogleSignin = async () => {
    const supabase = createClient();

    const callback = new URL("/auth/callback", window.location.origin);
    const next = safeInternalPath(new URLSearchParams(window.location.search).get("next"));
    if (next) callback.searchParams.set("next", next);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString() },
    });

    // Never swallowed. This used to be discarded into `_`, so a Google sign-in
    // that failed did nothing at all: no redirect, no message, a dead button.
    if (error) {
      toast.error({
        title: "Could not start Google sign-in",
        description: error.message,
      });
    }
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
