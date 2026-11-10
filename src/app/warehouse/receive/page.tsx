import { redirect } from "next/navigation";

/**
 * `/warehouse/receive` — folded into the warehouse home (098). Old links and
 * bookmarks land on the matching tab.
 */
export default async function WarehouseReceivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { stage } = await searchParams;
  redirect(stage === "received" || stage === "packed" ? "/warehouse?tab=hub" : "/warehouse?tab=expected");
}
