import type { Metadata } from "next";

import { AdminPage } from "@/components/layout/admin/admin-page";
import { getAiUsageDay } from "@/features/ai-usage/ai-usage.service";
import { AiUsageBoard } from "@/features/ai-usage/components/ai-usage-board";

export const metadata: Metadata = {
  title: "AI use · Admin",
  description: "Who uses the shopping assistant, and how much, per day.",
};
export const dynamic = "force-dynamic";

/**
 * `/admin/ai-usage` (140): every message to the shopping assistant and every
 * search it ran, per person per day, so abuse shows. Gated on the admin role by
 * `src/proxy.ts`, like the rest of `/admin`; read with the service role.
 */
export default async function AdminAiUsagePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const raw = Array.isArray(params.day) ? params.day[0] : params.day;
  const day = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw <= today ? raw : today;
  const view = await getAiUsageDay(day);
  return (
    <AdminPage title="AI use" blurb="Every message to the shopping assistant and every search it ran, per person, per day. Visitors are grouped by a hash of their IP, so clearing cookies does not hide anyone.">
      <AiUsageBoard view={view} today={today} />
    </AdminPage>
  );
}
