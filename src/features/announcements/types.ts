/** What a customer sees of a message from the communication center (119). */
export interface CustomerAnnouncement {
  id: string;
  title: string;
  body: string;
  link_href: string | null;
  link_label: string | null;
  created_at: string;
  /** Already shown as a pop-up once; it stays in the bell until dismissed. */
  seen: boolean;
}

export interface AdminAnnouncement {
  id: string;
  title: string;
  body: string;
  link_href: string | null;
  link_label: string | null;
  audience: "all" | "ordered" | "one";
  audience_label: string;
  status: "sent" | "withdrawn";
  created_at: string;
  expires_at: string | null;
  reach: number;
  seen: number;
  dismissed: number;
}
