import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { getAuthenticatedUser } from "@/features/auth/services/auth.service";
import { FinderRunScreen } from "@/features/finder/components/finder-run-screen";
import { finderRunIdSchema } from "@/features/finder/schema";
import { getFinderRunView } from "@/features/finder/services/finder-run.service";
import { readQuoteSessionFromCookies } from "@/lib/quote-session";

export const metadata: Metadata = {
  title: "Price finder",
  description: "We search the US stores we buy from and show the best price landed in Accra, in cedis.",
  robots: { index: false },
};

/**
 * One price finder run (105). Public like the quote flow and scoped to its
 * viewer: the signed-in customer, or the visitor's quote-session cookie.
 * Anyone else's id is a 404, not a login wall.
 */
export default async function FinderRunPage({ params }: { params: Promise<{ id: string }> }) {
  const id = finderRunIdSchema.safeParse((await params).id);
  if (!id.success) notFound();

  const [user, cookieStore] = await Promise.all([getAuthenticatedUser(), cookies()]);
  const viewer = { userId: user?.id ?? null, sessionId: readQuoteSessionFromCookies(cookieStore) };
  const view = await getFinderRunView(id.data, viewer);
  if (!view) notFound();

  return <FinderRunScreen key={view.id} initial={view} signedIn={user != null} />;
}
