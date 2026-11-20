"use client";

import { useCallback, useState } from "react";

import { cn } from "@/lib/utils";

interface EmailPreviewProps {
  subject: string;
  html: string;
  to: string;
  width: "mobile" | "desktop";
  theme: "light" | "dark";
}

/**
 * The rendered email in an inbox-like frame. The iframe's `color-scheme`
 * drives the email's own `prefers-color-scheme` block, so the theme toggle
 * shows the dark version the way a mail client would.
 */
export function EmailPreview({ subject, html, to, width, theme }: EmailPreviewProps) {
  const [height, setHeight] = useState(900);
  // Links open outside the preview, as they would from a mail client.
  const doc = html.replace("<head>", '<head><base target="_blank" />');

  const measure = useCallback((frame: HTMLIFrameElement | null) => {
    const root = frame?.contentDocument?.documentElement;
    if (root) setHeight(root.scrollHeight);
  }, []);

  return (
    <div className={cn("mx-auto flex w-full flex-col", width === "mobile" ? "max-w-[390px]" : "max-w-[680px]")}>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-border px-5 py-4 text-[13px]">
        <dt className="text-muted-foreground">From</dt>
        <dd className="font-medium">Tomame</dd>
        <dt className="text-muted-foreground">To</dt>
        <dd className="truncate">{to}</dd>
        <dt className="text-muted-foreground">Subject</dt>
        <dd className="font-semibold">{subject}</dd>
      </dl>
      <iframe
        title="Price finder result email"
        srcDoc={doc}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        onLoad={(e) => measure(e.currentTarget)}
        className={cn("block w-full border-0", theme === "dark" ? "[color-scheme:dark]" : "[color-scheme:light]")}
        height={height}
      />
    </div>
  );
}
