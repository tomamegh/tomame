import { AdminPage } from "@/components/layout/admin";
import { AdminPasteQueue } from "@/features/extraction/components/admin-paste-queue";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Paste queue · Tomame admin",
  description: "Every link a customer has handed the extractor.",
};

/**
 * `/admin/pastes` — the sidebar has linked here since the v2 nav landed and
 * there was nothing at the end of it.
 *
 * The frame only. Everything on the screen is fetched from
 * `GET /api/admin/pastes`, which authorizes itself; the route is additionally
 * gated by `src/proxy.ts` on the `admin` role, like the rest of `/admin`.
 */
export default function AdminPastesPage() {
  return (
    <AdminPage
      title="Paste queue"
      blurb="Every link a customer has handed the extractor, and what it made of them. When a store keeps failing, this is where it shows."
    >
      <AdminPasteQueue />
    </AdminPage>
  );
}
