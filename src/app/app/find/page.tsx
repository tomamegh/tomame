import type { Metadata } from "next";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { FinderStartScreen } from "@/features/finder/components/finder-start-screen";

export const metadata: Metadata = {
  title: "Price finder",
  description: "Tell us what you want. We search the US stores we buy from and show the best price landed in Accra.",
};

/** The price finder's ask screen; `?q=` fills the box. */
export default async function FinderPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.slice(0, 160) : "";
  const user = await getAuthenticatedUser();
  return <FinderStartScreen defaultQuery={query} signedIn={user != null} />;
}
