import type { Metadata } from "next";

import { AdminPage } from "@/components/layout/admin";
import { ContactQueue } from "@/features/contact/components/contact-queue";

export const metadata: Metadata = {
  title: "Contact messages · Tomame admin",
};

/**
 * `/admin/contact-messages` — the frame.
 *
 * The queue is a client island: it is worked rather than read, and each row has
 * a reply to send and a note to write. It fetches from
 * `GET /api/admin/contact-messages`, which authorizes itself; `src/proxy.ts`
 * gates the whole `/admin` prefix on the `admin` role besides.
 */
export default function AdminContactMessagesPage() {
  return (
    <AdminPage
      title="Contact messages"
      blurb="Everything sent through the contact form. The sender is usually signed out, so the address they left is the only way back to them."
    >
      <ContactQueue />
    </AdminPage>
  );
}
