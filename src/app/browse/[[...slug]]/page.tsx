import { redirect } from "next/navigation";

import { catalogueRedirectHref } from "@/features/extraction/components/buy-for-me-mode";

/** `/browse` (and `/browse/<shelf>`) is Browse beside the chat; it must never 404. */
export default async function BrowseRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  redirect(catalogueRedirectHref(query, slug?.map(safeDecode)));
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
