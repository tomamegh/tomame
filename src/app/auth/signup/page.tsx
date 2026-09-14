import { SignupForm } from "@/features/auth/components";
import { safeInternalPath } from "@/lib/auth/post-auth-destination";

/**
 * `next` is read HERE, in the server component, and handed down as a prop.
 *
 * Not with `useSearchParams` inside the form: this page is prerendered, and a
 * search-param hook in a prerendered tree needs a Suspense boundary around
 * every caller. Reading it here keeps the form a plain client component and
 * keeps the destination alive for a visitor who came from a quote, was asked
 * to sign in, and chose to create an account instead.
 */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.next) ? params.next[0] : params.next;
  return <SignupForm next={safeInternalPath(raw)} />;
}
