import { redirect } from "next/navigation";

/**
 * The assistant is Buy for me (108). `/app/find` was its own screen for a day;
 * old links and `?q=` (a prefilled ask) land on Buy for me instead. Chats stay
 * at `/app/find/chat/[id]` and one-line searches at `/app/find/[id]`.
 */
export default async function FinderPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { q } = await searchParams;
  const text = typeof q === "string" ? q.slice(0, 500).trim() : "";
  redirect(text ? `/app/orders/new?q=${encodeURIComponent(text)}` : "/app/orders/new");
}
