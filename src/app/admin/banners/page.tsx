import type { Metadata } from "next";

import { AdminPage } from "@/components/layout/admin";
import { listAllBanners } from "@/db/queries/site-banners";
import { AdminBanners } from "@/features/banners/components/admin-banners";

export const metadata: Metadata = {
  title: "Banners · Admin",
  description: "Notices shown in sections of the app.",
};

/**
 * `/admin/banners` (089). Server component reading every banner through the
 * service role; `src/proxy.ts` has already established the caller is an admin.
 */
export default async function AdminBannersPage() {
  const banners = await listAllBanners();
  return (
    <AdminPage
      title="Banners"
      blurb="Short notices in a section of the app — checkout, home, Buy for me, cars. Switch them on and off, or schedule them, without a deploy."
    >
      <AdminBanners banners={banners} now={new Date().toISOString()} />
    </AdminPage>
  );
}
