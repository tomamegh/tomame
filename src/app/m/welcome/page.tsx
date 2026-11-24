import { redirect } from "next/navigation";

import { currentUser } from "@/features/mobile/services/session.service";
import { Welcome } from "@/features/mobile/components/welcome";

/** Sign in to the iPhone app. Already signed in → straight to where they were going. */
export default async function MobileWelcomePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await currentUser()) redirect(next && /^\/m(\/|$|\?)/.test(next) ? next : "/m");
  return <Welcome next={next ?? null} />;
}
