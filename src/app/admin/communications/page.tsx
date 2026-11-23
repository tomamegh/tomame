import type { Metadata } from "next";

import { AdminBadge, AdminCard, AdminEmpty, AdminPage } from "@/components/layout/admin";
import { audienceSize } from "@/db/queries/announcements";
import { ComposeAnnouncement } from "@/features/announcements/components/compose-announcement";
import { WithdrawAnnouncementButton } from "@/features/announcements/components/withdraw-button";
import { listAdminAnnouncements } from "@/features/announcements/services/announcements.service";
import { formatAdminDateTime } from "@/features/orders/components/admin-order-display";

export const metadata: Metadata = { title: "Communication center · Admin" };

/**
 * `/admin/communications` — the communication center (119). Write a message,
 * choose who gets it, send it: signed-in customers see it as a pop-up on their
 * next visit and in their bell until they dismiss it. In-app only, never
 * emailed. Every send and withdrawal is audited.
 */
export default async function CommunicationsPage() {
  const [sent, all, ordered] = await Promise.all([listAdminAnnouncements(), audienceSize("all"), audienceSize("ordered")]);

  return (
    <AdminPage
      title="Communication center"
      blurb="Send a message to customers. It shows as a pop-up the next time they open Tomame, then stays in their bell until they dismiss it."
    >
      <AdminCard index={0} title="New message">
        <ComposeAnnouncement reach={{ all, ordered }} />
      </AdminCard>

      <AdminCard index={1} title="Sent" blurb="Newest first. Seen means the pop-up was shown; dismissed means the customer closed it for good.">
        {sent.length === 0 ? (
          <AdminEmpty title="Nothing sent yet" body="Messages you send appear here with how many customers saw them." />
        ) : (
          <ul className="flex flex-col gap-2">
            {sent.map((a) => (
              <li key={a.id} className="flex flex-col gap-1.5 rounded-[14px] bg-tm-paper px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 text-[14px] leading-snug font-semibold break-words text-tm-ink">{a.title}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    {a.status === "withdrawn" ? <AdminBadge tone="muted">Withdrawn</AdminBadge> : <AdminBadge tone="green">Live</AdminBadge>}
                    {a.status === "sent" ? <WithdrawAnnouncementButton id={a.id} title={a.title} /> : null}
                  </span>
                </div>
                <p className="line-clamp-2 text-[13px] leading-[1.5] font-medium break-words text-tm-text-2">{a.body}</p>
                <p className="tm-nums text-[12px] font-medium text-tm-text-3">
                  {formatAdminDateTime(a.created_at)} · {a.audience_label} · seen by {a.seen} of {a.reach} · dismissed by {a.dismissed}
                  {a.link_href ? ` · button “${a.link_label}” → ${a.link_href}` : ""}
                  {a.expires_at ? ` · until ${formatAdminDateTime(a.expires_at)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>
    </AdminPage>
  );
}
