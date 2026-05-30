import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PolicyRow } from "@/features/policies/types";
import { PolicyEditor } from "./policy-editor";

export default async function AdminPolicyEditorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const db = createAdminClient();
  const { data, error } = await db
    .from("policies")
    .select(
      "id, slug, label, content, effective_date, last_updated, is_published",
    )
    .eq("slug", slug)
    .single();

  if (error || !data) {
    notFound();
  }

  return <PolicyEditor policy={data as PolicyRow} />;
}
